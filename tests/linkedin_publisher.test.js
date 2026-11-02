import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  initializeUpload,
  uploadImageBinary,
  createPost,
  publishToLinkedIn,
  publishDraft,
  loadPendingDrafts,
  removeDraftFromStorage,
  LINKEDIN_API_VERSION,
  RESTLI_PROTOCOL_VERSION,
} from '../scripts/linkedin_publisher.js';

describe('LinkedIn 3-Step Publisher', () => {
  let tmpDir;
  let testDraftsPath;
  let testImagePath;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'li-test-'));
    testDraftsPath = path.join(tmpDir, 'pending_drafts.json');
    testImagePath = path.join(tmpDir, 'sample_diagram.png');
    await fs.promises.writeFile(testImagePath, Buffer.from('fake-png-binary-data'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Step 1: initializeUpload', () => {
    it('sends POST with correct headers and owner URN payload', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return new Response(
          JSON.stringify({
            value: {
              uploadUrl: 'https://api.linkedin.com/mediaUpload/test-url-123',
              image: 'urn:li:image:D5622AQG123',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await initializeUpload({
        ownerUrn: 'urn:li:person:test-user-id',
        accessToken: 'mock-access-token',
        fetchClient: mockFetch,
      });

      assert.equal(
        capturedUrl,
        'https://api.linkedin.com/rest/images?action=initializeUpload'
      );
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['LinkedIn-Version'], LINKEDIN_API_VERSION);
      assert.equal(capturedOptions.headers['X-Restli-Protocol-Version'], RESTLI_PROTOCOL_VERSION);
      assert.equal(capturedOptions.headers['Authorization'], 'Bearer mock-access-token');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');

      const parsedBody = JSON.parse(capturedOptions.body);
      assert.deepEqual(parsedBody, {
        initializeUploadRequest: {
          owner: 'urn:li:person:test-user-id',
        },
      });

      assert.equal(result.uploadUrl, 'https://api.linkedin.com/mediaUpload/test-url-123');
      assert.equal(result.imageUrn, 'urn:li:image:D5622AQG123');
    });

    it('throws error when LinkedIn returns an error status (e.g. 401)', async () => {
      const mockFetch = async () => {
        return new Response('Unauthorized: token expired', { status: 401 });
      };

      await assert.rejects(
        () =>
          initializeUpload({
            ownerUrn: 'urn:li:person:user',
            accessToken: 'expired-token',
            fetchClient: mockFetch,
          }),
        /LinkedIn initializeUpload failed \(401\)/
      );
    });

    it('throws error if response is missing uploadUrl or image URN', async () => {
      const mockFetch = async () => {
        return new Response(JSON.stringify({ value: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await assert.rejects(
        () =>
          initializeUpload({
            ownerUrn: 'urn:li:person:user',
            accessToken: 'token',
            fetchClient: mockFetch,
          }),
        /missing uploadUrl or image URN/
      );
    });
  });

  describe('Step 2: uploadImageBinary', () => {
    it('sends binary stream via PUT to uploadUrl', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return new Response('', { status: 201 });
      };

      const imageBuffer = Buffer.from('test-image-content');
      const result = await uploadImageBinary({
        uploadUrl: 'https://upload.linkedin.com/binary/abc',
        imageBuffer,
        accessToken: 'mock-token',
        fetchClient: mockFetch,
      });

      assert.equal(capturedUrl, 'https://upload.linkedin.com/binary/abc');
      assert.equal(capturedOptions.method, 'PUT');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/octet-stream');
      assert.deepEqual(capturedOptions.body, imageBuffer);
      assert.equal(result.success, true);
    });

    it('reads from imagePath if imageBuffer is omitted', async () => {
      let capturedBody = null;

      const mockFetch = async (url, options) => {
        capturedBody = options.body;
        return new Response('', { status: 200 });
      };

      await uploadImageBinary({
        uploadUrl: 'https://upload.linkedin.com/binary/abc',
        imagePath: testImagePath,
        fetchClient: mockFetch,
      });

      assert.deepEqual(capturedBody, Buffer.from('fake-png-binary-data'));
    });

    it('throws error when binary upload fails (e.g. 500)', async () => {
      const mockFetch = async () => {
        return new Response('Internal Server Error', { status: 500 });
      };

      await assert.rejects(
        () =>
          uploadImageBinary({
            uploadUrl: 'https://upload.linkedin.com/binary/fail',
            imageBuffer: Buffer.from('data'),
            fetchClient: mockFetch,
          }),
        /LinkedIn uploadImageBinary failed \(500\)/
      );
    });
  });

  describe('Step 3: createPost', () => {
    it('sends POST to /rest/posts with author, commentary, visibility, media id and extracts x-restli-id', async () => {
      let capturedUrl = null;
      let capturedOptions = null;

      const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return new Response('', {
          status: 201,
          headers: {
            'x-restli-id': 'urn:li:share:7123456789012345678',
          },
        });
      };

      const result = await createPost({
        authorUrn: 'urn:li:person:pers-999',
        commentary: 'Building resilient event-driven architectures with idempotency.',
        imageUrn: 'urn:li:image:D5622AQG123',
        accessToken: 'mock-access-token',
        fetchClient: mockFetch,
      });

      assert.equal(capturedUrl, 'https://api.linkedin.com/rest/posts');
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['LinkedIn-Version'], LINKEDIN_API_VERSION);
      assert.equal(capturedOptions.headers['X-Restli-Protocol-Version'], RESTLI_PROTOCOL_VERSION);
      assert.equal(capturedOptions.headers['Authorization'], 'Bearer mock-access-token');

      const body = JSON.parse(capturedOptions.body);
      assert.equal(body.author, 'urn:li:person:pers-999');
      assert.equal(body.commentary, 'Building resilient event-driven architectures with idempotency.');
      assert.equal(body.visibility, 'PUBLIC');
      assert.equal(body.content?.media?.id, 'urn:li:image:D5622AQG123');
      assert.equal(body.lifecycleState, 'PUBLISHED');

      assert.equal(result.postUrn, 'urn:li:share:7123456789012345678');
      assert.equal(
        result.liveUrl,
        'https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678'
      );
    });

    it('throws error when post creation returns an error status (e.g. 422)', async () => {
      const mockFetch = async () => {
        return new Response('Unprocessable entity', { status: 422 });
      };

      await assert.rejects(
        () =>
          createPost({
            authorUrn: 'urn:li:person:pers-999',
            commentary: 'Test commentary',
            imageUrn: 'urn:li:image:123',
            accessToken: 'token',
            fetchClient: mockFetch,
          }),
        /LinkedIn createPost failed \(422\)/
      );
    });

    it('throws error when response lacks x-restli-id', async () => {
      const mockFetch = async () => {
        return new Response(JSON.stringify({}), {
          status: 201,
          headers: {},
        });
      };

      await assert.rejects(
        () =>
          createPost({
            authorUrn: 'urn:li:person:pers-999',
            commentary: 'Test commentary',
            imageUrn: 'urn:li:image:123',
            accessToken: 'token',
            fetchClient: mockFetch,
          }),
        /missing x-restli-id header/
      );
    });
  });

  describe('Full 3-Step Publishing: publishToLinkedIn', () => {
    it('executes Step 1 -> Step 2 -> Step 3 in sequence and returns live URL', async () => {
      const callLog = [];

      const mockFetch = async (url, options) => {
        if (url.includes('/images?action=initializeUpload')) {
          callLog.push({ step: 1, method: options.method });
          return new Response(
            JSON.stringify({
              value: {
                uploadUrl: 'https://upload.linkedin.com/upload-target-456',
                image: 'urn:li:image:ASSET_789',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url === 'https://upload.linkedin.com/upload-target-456') {
          callLog.push({ step: 2, method: options.method });
          return new Response('', { status: 201 });
        }

        if (url.includes('/posts')) {
          callLog.push({ step: 3, method: options.method, body: JSON.parse(options.body) });
          return new Response('', {
            status: 201,
            headers: { 'x-restli-id': 'urn:li:share:9876543210' },
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await publishToLinkedIn({
        commentary: 'Full 3-step test commentary.',
        imageBuffer: Buffer.from('test-image'),
        authorUrn: 'urn:li:person:author-1',
        accessToken: 'access-token-123',
        fetchClient: mockFetch,
      });

      assert.equal(callLog.length, 3);
      assert.equal(callLog[0].step, 1);
      assert.equal(callLog[1].step, 2);
      assert.equal(callLog[2].step, 3);
      assert.equal(callLog[2].body.content.media.id, 'urn:li:image:ASSET_789');

      assert.equal(result.success, true);
      assert.equal(result.postUrn, 'urn:li:share:9876543210');
      assert.equal(
        result.liveUrl,
        'https://www.linkedin.com/feed/update/urn:li:share:9876543210'
      );
      assert.equal(result.imageUrn, 'urn:li:image:ASSET_789');
    });
  });

  describe('Draft Queue State & Error Handling: publishDraft', () => {
    it('on success: removes approved draft from pending_drafts.json and returns live URL', async () => {
      const initialDrafts = [
        {
          id: 1,
          title: 'Circuit Breaker Pattern',
          text: 'Deep dive into Circuit Breaker resilience pattern.',
          image_path: testImagePath,
        },
        {
          id: 2,
          title: 'Database Sharding Strategies',
          text: 'How to scale relational databases horizontally.',
          image_path: testImagePath,
        },
      ];
      await fs.promises.writeFile(testDraftsPath, JSON.stringify(initialDrafts, null, 2));

      const mockFetch = async (url) => {
        if (url.includes('/images?action=initializeUpload')) {
          return new Response(
            JSON.stringify({
              value: {
                uploadUrl: 'https://upload.linkedin.com/target',
                image: 'urn:li:image:IMG_1',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/upload')) {
          return new Response('', { status: 200 });
        }
        if (url.includes('/posts')) {
          return new Response('', {
            status: 201,
            headers: { 'x-restli-id': 'urn:li:share:11111' },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await publishDraft({
        draftId: 1,
        draftsPath: testDraftsPath,
        authorUrn: 'urn:li:person:auth',
        accessToken: 'token',
        fetchClient: mockFetch,
      });

      assert.equal(result.success, true);
      assert.equal(result.draftId, 1);
      assert.equal(result.liveUrl, 'https://www.linkedin.com/feed/update/urn:li:share:11111');

      // Verify that draft 1 was removed, but draft 2 was retained
      const { drafts: remainingDrafts } = await loadPendingDrafts(testDraftsPath);
      assert.equal(remainingDrafts.length, 1);
      assert.equal(remainingDrafts[0].id, 2);
    });

    it('defaults to latest pending draft when draftId is not specified', async () => {
      const initialDrafts = [
        {
          id: 1,
          title: 'Topic 1',
          text: 'Text 1',
          image_path: testImagePath,
        },
        {
          id: 2,
          title: 'Topic 2 (Latest)',
          text: 'Text 2',
          image_path: testImagePath,
        },
      ];
      await fs.promises.writeFile(testDraftsPath, JSON.stringify(initialDrafts, null, 2));

      const mockFetch = async (url) => {
        if (url.includes('/images?action=initializeUpload')) {
          return new Response(
            JSON.stringify({
              value: { uploadUrl: 'https://upload.linkedin.com/target', image: 'urn:li:image:2' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/upload')) {
          return new Response('', { status: 200 });
        }
        if (url.includes('/posts')) {
          return new Response('', {
            status: 201,
            headers: { 'x-restli-id': 'urn:li:share:22222' },
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const result = await publishDraft({
        draftsPath: testDraftsPath,
        authorUrn: 'urn:li:person:auth',
        accessToken: 'token',
        fetchClient: mockFetch,
      });

      assert.equal(result.success, true);
      assert.equal(result.draftId, 2);

      // Draft 2 was published and removed; draft 1 remains
      const { drafts: remainingDrafts } = await loadPendingDrafts(testDraftsPath);
      assert.equal(remainingDrafts.length, 1);
      assert.equal(remainingDrafts[0].id, 1);
    });

    it('on error: retains draft in pending_drafts.json for retry and returns error details', async () => {
      const initialDrafts = [
        {
          id: 5,
          title: 'Raft Consensus Algorithm',
          text: 'Distributed consensus made understandable.',
          image_path: testImagePath,
        },
      ];
      await fs.promises.writeFile(testDraftsPath, JSON.stringify(initialDrafts, null, 2));

      const mockFetch = async () => {
        // Simulate LinkedIn API returning 429 Too Many Requests (Rate limit)
        return new Response('Rate limit exceeded', { status: 429 });
      };

      const result = await publishDraft({
        draftId: 5,
        draftsPath: testDraftsPath,
        authorUrn: 'urn:li:person:auth',
        accessToken: 'token',
        fetchClient: mockFetch,
      });

      assert.equal(result.success, false);
      assert.equal(result.draftId, 5);
      assert.match(result.error, /LinkedIn initializeUpload failed \(429\)/);
      assert.ok(result.details);

      // Verify draft is STILL in pending_drafts.json
      const { drafts: retainedDrafts } = await loadPendingDrafts(testDraftsPath);
      assert.equal(retainedDrafts.length, 1);
      assert.equal(retainedDrafts[0].id, 5);
    });

    it('on draft not found: returns error and retains existing drafts', async () => {
      const initialDrafts = [
        {
          id: 10,
          title: 'CAP Theorem',
          text: 'Consistency vs Availability.',
          image_path: testImagePath,
        },
      ];
      await fs.promises.writeFile(testDraftsPath, JSON.stringify(initialDrafts, null, 2));

      const result = await publishDraft({
        draftId: 999,
        draftsPath: testDraftsPath,
        authorUrn: 'urn:li:person:auth',
        accessToken: 'token',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /Draft #999 not found/);

      const { drafts } = await loadPendingDrafts(testDraftsPath);
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].id, 10);
    });

    it('on missing credentials: fails safely and retains pending drafts', async () => {
      const initialDrafts = [
        {
          id: 3,
          title: 'Saga Pattern',
          text: 'Managing distributed transactions.',
          image_path: testImagePath,
        },
      ];
      await fs.promises.writeFile(testDraftsPath, JSON.stringify(initialDrafts, null, 2));

      const result = await publishDraft({
        draftId: 3,
        draftsPath: testDraftsPath,
        authorUrn: '',
        accessToken: '',
      });

      assert.equal(result.success, false);
      assert.match(result.error, /Missing LinkedIn/);

      const { drafts } = await loadPendingDrafts(testDraftsPath);
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].id, 3);
    });
  });

  describe('Storage Utilities', () => {
    it('loadPendingDrafts handles both array and { drafts: [] } format', async () => {
      await fs.promises.writeFile(
        testDraftsPath,
        JSON.stringify({ drafts: [{ id: 1 }, { id: 2 }] })
      );
      const res = await loadPendingDrafts(testDraftsPath);
      assert.equal(res.format, 'object');
      assert.equal(res.drafts.length, 2);

      await fs.promises.writeFile(testDraftsPath, JSON.stringify([{ id: 3 }]));
      const res2 = await loadPendingDrafts(testDraftsPath);
      assert.equal(res2.format, 'array');
      assert.equal(res2.drafts.length, 1);
    });

    it('removeDraftFromStorage removes target draft and keeps others', async () => {
      await fs.promises.writeFile(
        testDraftsPath,
        JSON.stringify([{ id: 10 }, { id: 20 }, { id: 30 }])
      );
      const remaining = await removeDraftFromStorage(testDraftsPath, 20);
      assert.deepEqual(
        remaining.map((d) => d.id),
        [10, 30]
      );
    });
  });
});
