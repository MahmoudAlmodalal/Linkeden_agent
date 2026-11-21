import fs from 'node:fs';
import path from 'node:path';
import {
  createGeminiClient,
  synthesizeRAGDraft,
  resolveVisualAsset,
  generateRawText,
  generatePostContent,
  getNextInnovation,
} from './gemini_engine.js';
import { proposeTopic, saveTopicToHistory, topicFromTechnicalSeed } from './topic_mode.js';
import { addPendingDraft, addScenario } from './telegram_router.js';
import { renderCardImage } from './generate_card_asset.js';
import { generateCardContent } from './card_content.js';
import { generateCodeCard, codeCardHTML } from './code_card.js';
import { resolveDataPath, resolveAssetPath } from './path_resolver.js';
import { allocateDraftId } from './draft_store.js';
import { generateWithGate, resolveMaxAttempts } from './quality_gate.js';

export async function runRAGStaging({
  query = '',
  situation = '',
  draftId = null,
  client = null,
  draftsPath = resolveDataPath('pending_drafts.json'),
  scenariosPath = resolveDataPath('scenarios.json'),
  topicHistoryPath = resolveDataPath('topic_history.json'),
  assetsDir = resolveAssetPath('assets'),
  outputDir = resolveDataPath('generated_images'),
  useBrandedCard = true,
  useProjectImage = false,
  cfAccountId,
  cfApiToken,
  fetchClient,
  synthesizeRAGDraftFn = synthesizeRAGDraft,
  renderCardImageFn = renderCardImage,
  generateCardContentFn = generateCardContent,
  gateMaxAttempts = resolveMaxAttempts(),
} = {}) {
  // Single source of truth for ID allocation: the workflow must not pre-compute
  // this value, otherwise two concurrent staging runs can pick the same ID.
  const calculatedDraftId = draftId ?? (await allocateDraftId(draftsPath));

  // User-supplied text is a technical seed by default, not proof of a personal incident.
  // Project-grounded RAG is reserved for an explicit query.
  const isGeneralMode = !String(query || '').trim();

  let generalTopic = null;
  if (isGeneralMode) {
    generalTopic = String(situation || '').trim()
      ? topicFromTechnicalSeed(situation)
      : await proposeTopic({
        generateText: async (prompt) => {
          const res = await generateRawText(prompt, {
            client,
            cfAccountId,
            cfApiToken,
            fetchClient,
          });
          return res.text;
        },
        historyPath: topicHistoryPath,
      });
  }

  const produceDraft = async () => {
    if (isGeneralMode) {
      const topic = generalTopic;
      const innovation = getNextInnovation();
      const textResult = await generatePostContent(topic, {
        client,
        innovation,
        cfAccountId,
        cfApiToken,
        fetchClient,
      });
      return {
        project: null,
        challenge: null,
        situation: '',
        topic,
        text: textResult.text,
        visualPath: null,
        visualSource: 'none',
        modelUsed: {
          text: textResult.model,
          visual: null,
        },
        providerUsed: {
          text: textResult.provider || 'gemini',
          visual: 'none',
        },
      };
    }
    return synthesizeRAGDraftFn({
      query,
      situation,
      client,
      assetsDir,
      outputDir,
      cfAccountId,
      cfApiToken,
      fetchClient,
      skipRemoteVisual: useBrandedCard,
    });
  };

  // Quality gate: regenerate (bounded) until length/hashtag rules pass; if retries
  // run out the last draft is still staged, flagged with warnings for the reviewer.
  const { draft, gate } = await generateWithGate(produceDraft, { maxAttempts: gateMaxAttempts });

  if (isGeneralMode) {
    saveTopicToHistory(
      {
        title: generalTopic.title,
        slug: generalTopic.slug,
        area: generalTopic.area,
        language: generalTopic.language,
      },
      topicHistoryPath
    );
  }

  let finalImagePath = draft.visualPath;
  let finalVisualSource = draft.visualSource;
  let imageError = null;

  // Resolve local project asset for branded card background or explicit project image
  const projectSlug = draft.project || draft.topic?.slug || 'portfolio';
  const projectImage = resolveVisualAsset(projectSlug, { assetsDir });

  // Check if user explicitly asked to use project image
  const combinedPrompt = `${query} ${situation}`.toLowerCase();
  const isProjectImageRequested = Boolean(
    useProjectImage ||
    /صورة\s*(?:الـ|لـ)?مشروع|صورة\s*المشروع|project[\s_-]*image|screenshot|صورة\s*حقيقية/i.test(combinedPrompt)
  );

  if (isProjectImageRequested && projectImage) {
    // User explicitly requested project image
    finalImagePath = projectImage;
    finalVisualSource = 'local';
  } else if (useBrandedCard) {
    // Default: Always use mahmoud_card and write post content on it
    try {
      const topic = draft.challenge || draft.topic;
      const language = topic?.language || draft.topic?.language || 'ar';
      const generateText = async (prompt) => {
        const res = await generateRawText(prompt, {
          client,
          cfAccountId,
          cfApiToken,
          fetchClient,
        });
        return res.text;
      };
      // Preferred visual: a real code snippet in an editor window (reads as human, not a template).
      // Falls back to the infographic card if the model cannot produce a valid snippet.
      let cardResult = null;
      try {
        const code = await generateCodeCard({ generateText, postText: draft.text, topic, language });
        cardResult = await renderCardImageFn({}, {
          outputDir,
          filename: `code-draft-${calculatedDraftId}-${Date.now()}.png`,
          html: codeCardHTML(code),
        });
      } catch (codeErr) {
        console.warn(`[CodeCard] ${codeErr.message}. Falling back to infographic card.`);
      }
      if (!cardResult?.imagePath) {
        const cardContent = await generateCardContentFn({
          generateText,
          postText: draft.text,
          topic,
          language,
        });
        cardResult = await renderCardImageFn(cardContent, {
          outputDir,
          filename: `card-draft-${calculatedDraftId}-${Date.now()}.png`,
        });
      }
      if (cardResult?.imagePath) {
        finalImagePath = cardResult.imagePath;
        finalVisualSource = 'branded_card';
      } else {
        throw new Error('Card renderer did not return an image path');
      }
    } catch (cardErr) {
      imageError = cardErr.message;
      if (!isProjectImageRequested && finalVisualSource === 'local') {
        finalImagePath = null;
        finalVisualSource = 'none';
      }
      console.warn(`[CardGenerator] Could not render branded card: ${cardErr.message}. Keeping only a fresh topic image, if available.`);
    }
  }

  const newDraft = {
    id: calculatedDraftId,
    project: draft.project,
    topic: draft.challenge?.title || draft.topic.title,
    situation: isGeneralMode ? null : (situation || null),
    text: draft.text,
    post_text: draft.text,
    image_path: finalImagePath,
    visual_source: finalVisualSource,
    model_used: draft.modelUsed,
    provider_used: draft.providerUsed,
    challenge: draft.challenge,
    status: 'pending',
    gate,
    created_at: new Date().toISOString(),
  };

  addPendingDraft(newDraft, draftsPath);

  if (situation && !isGeneralMode) {
    try {
      addScenario({
        draftId: calculatedDraftId,
        situation,
        topic: newDraft.topic,
        created_at: new Date().toISOString(),
      }, scenariosPath);
    } catch (scenErr) {
      console.warn(`[ScenarioArchive] Could not archive scenario: ${scenErr.message}`);
    }
  }

  return {
    success: true,
    draftId: calculatedDraftId,
    draft: newDraft,
    ...(imageError ? { imageError } : {}),
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('generate_rag_draft.js')) {
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(); } catch {}
  }
  const args = process.argv.slice(2);
  const queryIdx = args.indexOf('--query');
  const query = queryIdx !== -1 && args[queryIdx + 1] ? args[queryIdx + 1] : '';

  const sitIdx = args.indexOf('--situation');
  const situation = sitIdx !== -1 && args[sitIdx + 1] ? args[sitIdx + 1] : '';

  const idIdx = args.indexOf('--id');
  const draftId = idIdx !== -1 && args[idIdx + 1] ? parseInt(args[idIdx + 1], 10) : null;

  const noCard = args.includes('--no-card');
  const projectImage = args.includes('--project-image') || args.includes('--use-project-image');

  const clientPromise = (!process.env.OPENROUTER_API_KEY && process.env.GEMINI_API_KEY)
    ? createGeminiClient()
    : Promise.resolve(null);

  clientPromise
    .then((client) => runRAGStaging({
      query,
      situation,
      draftId,
      client,
      useBrandedCard: !noCard,
      useProjectImage: projectImage,
    }))
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error('RAG Staging failed:', err);
      process.exit(1);
    });
}
