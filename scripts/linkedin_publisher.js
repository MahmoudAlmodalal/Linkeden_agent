import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LINKEDIN_API_VERSION = '202401';
export const RESTLI_PROTOCOL_VERSION = '2.0.0';
export const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';
export const DEFAULT_DRAFTS_PATH = 'data/pending_drafts.json';

/**
 * Step 1: Initialize Image Upload
 * POST https://api.linkedin.com/rest/images?action=initializeUpload
 */
export async function initializeUpload({
  ownerUrn,
  accessToken,
  fetchClient = globalThis.fetch,
}) {
  if (!ownerUrn) {
    throw new Error('Owner URN (urn:li:person:...) is required for initializeUpload');
  }
  if (!accessToken) {
    throw new Error('LinkedIn Access Token is required for initializeUpload');
  }

  const endpoint = `${LINKEDIN_API_BASE}/images?action=initializeUpload`;
  const headers = {
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': RESTLI_PROTOCOL_VERSION,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const body = {
    initializeUploadRequest: {
      owner: ownerUrn,
    },
  };

  const response = await fetchClient(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LinkedIn initializeUpload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json().catch(() => ({}));
  const uploadUrl = data?.value?.uploadUrl || data?.uploadUrl;
  const imageUrn = data?.value?.image || data?.image || data?.value?.imageUrn || data?.imageUrn;

  if (!uploadUrl || !imageUrn) {
    throw new Error('LinkedIn initializeUpload response missing uploadUrl or image URN');
  }

  return {
    uploadUrl,
    imageUrn,
  };
}

/**
 * Step 2: PUT Binary Image Stream to uploadUrl
 */
export async function uploadImageBinary({
  uploadUrl,
  imageBuffer,
  imagePath,
  accessToken,
  fetchClient = globalThis.fetch,
}) {
  if (!uploadUrl) {
    throw new Error('uploadUrl is required for uploadImageBinary');
  }

  let buffer = imageBuffer;
  if (!buffer && imagePath) {
    buffer = await fs.promises.readFile(imagePath);
  }
  if (!buffer) {
    throw new Error('imageBuffer or imagePath is required for uploadImageBinary');
  }

  const headers = {
    'Content-Type': 'application/octet-stream',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetchClient(uploadUrl, {
    method: 'PUT',
    headers,
    body: buffer,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LinkedIn uploadImageBinary failed (${response.status}): ${errorText}`);
  }

  return { success: true };
}

/**
 * Step 3: POST Post Creation to https://api.linkedin.com/rest/posts
 */
export async function createPost({
  authorUrn,
  commentary,
  imageUrn,
  accessToken,
  fetchClient = globalThis.fetch,
}) {
  if (!authorUrn) {
    throw new Error('authorUrn is required for createPost');
  }
  if (!commentary) {
    throw new Error('commentary is required for createPost');
  }
  if (!accessToken) {
    throw new Error('LinkedIn Access Token is required for createPost');
  }

  const endpoint = `${LINKEDIN_API_BASE}/posts`;
  const headers = {
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': RESTLI_PROTOCOL_VERSION,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const payload = {
    author: authorUrn,
    commentary,
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  if (imageUrn) {
    payload.content = {
      media: {
        id: imageUrn,
      },
    };
  }

  const response = await fetchClient(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LinkedIn createPost failed (${response.status}): ${errorText}`);
  }

  let postUrn = null;
  if (typeof response.headers?.get === 'function') {
    postUrn = response.headers.get('x-restli-id');
  } else if (response.headers && response.headers['x-restli-id']) {
    postUrn = response.headers['x-restli-id'];
  }

  if (!postUrn) {
    const data = await response.json().catch(() => ({}));
    postUrn = data?.id || data?.['x-restli-id'] || data?.value?.id;
  }

  if (!postUrn) {
    throw new Error('LinkedIn createPost response missing x-restli-id header');
  }

  const liveUrl = `https://www.linkedin.com/feed/update/${postUrn}`;

  return {
    postUrn,
    liveUrl,
  };
}

/**
 * 3-step publishing pipeline to LinkedIn
 */
export async function publishToLinkedIn({
  commentary,
  imagePath,
  imageBuffer,
  authorUrn,
  accessToken,
  fetchClient = globalThis.fetch,
}) {
  const token = accessToken || process.env.LINKEDIN_ACCESS_TOKEN || process.env.LINKEDIN_TOKEN;
  const author = authorUrn || process.env.LINKEDIN_PERSON_URN;

  if (!token) {
    throw new Error('Missing LinkedIn access token (LINKEDIN_ACCESS_TOKEN or LINKEDIN_TOKEN)');
  }
  if (!author) {
    throw new Error('Missing LinkedIn author URN (LINKEDIN_PERSON_URN)');
  }

  // Step 1: Initialize image upload
  const { uploadUrl, imageUrn } = await initializeUpload({
    ownerUrn: author,
    accessToken: token,
    fetchClient,
  });

  // Step 2: Upload binary image
  await uploadImageBinary({
    uploadUrl,
    imageBuffer,
    imagePath,
    accessToken: token,
    fetchClient,
  });

  // Step 3: Create post referencing image
  const { postUrn, liveUrl } = await createPost({
    authorUrn: author,
    commentary,
    imageUrn,
    accessToken: token,
    fetchClient,
  });

  return {
    success: true,
    postUrn,
    liveUrl,
    imageUrn,
  };
}

/**
 * Load pending drafts from JSON file
 */
export async function loadPendingDrafts(filePath = DEFAULT_DRAFTS_PATH) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { drafts: parsed, format: 'array' };
    }
    if (parsed && Array.isArray(parsed.drafts)) {
      return { drafts: parsed.drafts, format: 'object', rawObject: parsed };
    }
    return { drafts: [], format: 'array' };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { drafts: [], format: 'array' };
    }
    throw err;
  }
}

/**
 * Save pending drafts to JSON file
 */
export async function savePendingDrafts(filePath, drafts, formatInfo = { format: 'array' }) {
  await fs.promises.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  let output;
  if (formatInfo.format === 'object' && formatInfo.rawObject) {
    output = { ...formatInfo.rawObject, drafts };
  } else {
    output = drafts;
  }
  await fs.promises.writeFile(filePath, JSON.stringify(output, null, 2), 'utf-8');
}

/**
 * Remove draft from pending drafts file
 */
export async function removeDraftFromStorage(filePath, draftId) {
  const { drafts, format, rawObject } = await loadPendingDrafts(filePath);
  const updatedDrafts = drafts.filter((d) => String(d.id) !== String(draftId));
  await savePendingDrafts(filePath, updatedDrafts, { format, rawObject });
  return updatedDrafts;
}

/**
 * Main Orchestrator:
 * Approves and publishes draft from data/pending_drafts.json
 * - On success: removes draft from data/pending_drafts.json and returns live URL.
 * - On error: retains draft in data/pending_drafts.json for retry and returns error details.
 */
export async function publishDraft({
  draftId,
  draftsPath = process.env.PENDING_DRAFTS_PATH || DEFAULT_DRAFTS_PATH,
  authorUrn,
  accessToken,
  fetchClient = globalThis.fetch,
  imageBuffer,
  throwOnError = false,
} = {}) {
  let targetDraft = null;
  try {
    const { drafts } = await loadPendingDrafts(draftsPath);
    if (!drafts || drafts.length === 0) {
      const errorMsg = 'No pending drafts available to publish.';
      if (throwOnError) throw new Error(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (draftId !== undefined && draftId !== null && draftId !== '' && draftId !== 'latest') {
      targetDraft = drafts.find((d) => String(d.id) === String(draftId));
      if (!targetDraft) {
        const errorMsg = `Draft #${draftId} not found in pending drafts.`;
        if (throwOnError) throw new Error(errorMsg);
        return { success: false, error: errorMsg, draftId };
      }
    } else {
      // User Story 7: plain /approve without an ID defaults to the latest pending draft
      targetDraft = drafts[drafts.length - 1];
    }

    const commentary =
      targetDraft.commentary ||
      targetDraft.text ||
      targetDraft.content ||
      targetDraft.post_text ||
      targetDraft.body ||
      targetDraft.title;

    if (!commentary) {
      throw new Error(`Draft #${targetDraft.id} contains no text/commentary content.`);
    }

    const imagePath =
      targetDraft.image_path ||
      targetDraft.image ||
      targetDraft.asset_path ||
      targetDraft.media_path;

    const result = await publishToLinkedIn({
      commentary,
      imagePath,
      imageBuffer,
      authorUrn,
      accessToken,
      fetchClient,
    });

    // On success: remove draft from pending_drafts.json
    await removeDraftFromStorage(draftsPath, targetDraft.id);

    return {
      success: true,
      draftId: targetDraft.id,
      postUrn: result.postUrn,
      liveUrl: result.liveUrl,
      imageUrn: result.imageUrn,
    };
  } catch (err) {
    // On error: draft is NOT removed; retained in pending_drafts.json for retry
    if (throwOnError) {
      throw err;
    }
    return {
      success: false,
      draftId: targetDraft?.id ?? draftId,
      error: err.message,
      details: err.details || err.stack || String(err),
    };
  }
}

// CLI Execution entry point
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let requestedDraftId = null;

  for (const arg of args) {
    if (arg.startsWith('--draft-id=')) {
      requestedDraftId = arg.split('=')[1];
    } else if (arg.startsWith('--id=')) {
      requestedDraftId = arg.split('=')[1];
    } else if (!arg.startsWith('--')) {
      requestedDraftId = arg;
    }
  }

  publishDraft({ draftId: requestedDraftId })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error(JSON.stringify({ success: false, error: err.message }, null, 2));
      process.exit(1);
    });
}
