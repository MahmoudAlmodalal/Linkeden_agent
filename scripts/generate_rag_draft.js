import fs from 'node:fs';
import path from 'node:path';
import { createGeminiClient, synthesizeRAGDraft, resolveVisualAsset } from './gemini_engine.js';
import { addPendingDraft, loadPendingDrafts, addScenario } from './telegram_router.js';
import { renderCardImage, extractCardContent } from './generate_card_asset.js';

export async function runRAGStaging({
  query = '',
  situation = '',
  draftId = null,
  client = null,
  draftsPath = 'data/pending_drafts.json',
  scenariosPath = 'data/scenarios.json',
  assetsDir = 'assets',
  outputDir = 'data/generated_images',
  useBrandedCard = true,
  useProjectImage = false,
  cfAccountId,
  cfApiToken,
  fetchClient,
} = {}) {
  const existingDrafts = loadPendingDrafts(draftsPath);
  const calculatedDraftId = draftId ?? (
    existingDrafts.length > 0
      ? Math.max(...existingDrafts.map((d) => Number(d.id) || 0)) + 1
      : 1
  );

  const draft = await synthesizeRAGDraft({
    query,
    situation,
    client,
    assetsDir,
    outputDir,
    cfAccountId,
    cfApiToken,
    fetchClient,
  });

  let finalImagePath = draft.visualPath;
  let finalVisualSource = draft.visualSource;

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
      const cardContent = extractCardContent(draft.text, draft.challenge || draft.topic);

      const cardResult = await renderCardImage(cardContent, {
        outputDir,
        filename: `card-draft-${calculatedDraftId}.png`,
      });
      if (cardResult?.imagePath) {
        finalImagePath = cardResult.imagePath;
        finalVisualSource = 'branded_card';
      }
    } catch (cardErr) {
      console.warn(`[CardGenerator] Could not render branded card: ${cardErr.message}. Using default visual asset.`);
    }
  }

  const newDraft = {
    id: calculatedDraftId,
    project: draft.project,
    topic: draft.challenge?.title || draft.topic.title,
    situation: situation || null,
    text: draft.text,
    post_text: draft.text,
    image_path: finalImagePath,
    visual_source: finalVisualSource,
    model_used: draft.modelUsed,
    provider_used: draft.providerUsed,
    challenge: draft.challenge,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  addPendingDraft(newDraft, draftsPath);

  if (situation) {
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
  };
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith('generate_rag_draft.js')) {
  const args = process.argv.slice(2);
  const queryIdx = args.indexOf('--query');
  const query = queryIdx !== -1 && args[queryIdx + 1] ? args[queryIdx + 1] : '';

  const sitIdx = args.indexOf('--situation');
  const situation = sitIdx !== -1 && args[sitIdx + 1] ? args[sitIdx + 1] : '';

  const idIdx = args.indexOf('--id');
  const draftId = idIdx !== -1 && args[idIdx + 1] ? parseInt(args[idIdx + 1], 10) : null;

  const noCard = args.includes('--no-card');
  const projectImage = args.includes('--project-image') || args.includes('--use-project-image');

  const clientPromise = process.env.GEMINI_API_KEY
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
