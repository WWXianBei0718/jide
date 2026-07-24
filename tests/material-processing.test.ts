import assert from 'node:assert/strict';
import test from 'node:test';
import {
  materialProcessingMessage,
  processingJobTypeForMaterial,
} from '../src/lib/material-processing';

test('maps each non-text material to one explicit extraction job', () => {
  assert.equal(processingJobTypeForMaterial('image'), 'image_ocr');
  assert.equal(processingJobTypeForMaterial('audio'), 'audio_transcription');
  assert.equal(processingJobTypeForMaterial('video'), 'video_transcription');
  assert.equal(processingJobTypeForMaterial('document'), 'document_text');
  assert.equal(processingJobTypeForMaterial('text'), null);
});

test('processing copy never implies that a safely uploaded file is already understood', () => {
  assert.match(materialProcessingMessage('pending'), /等待提取/);
  assert.match(materialProcessingMessage('processing'), /正在提取/);
  assert.match(materialProcessingMessage('extracted'), /等待建立语义记忆/);
  assert.match(materialProcessingMessage('failed'), /原始文件仍安全保留/);
  assert.match(materialProcessingMessage('blocked'), /暂未开放/);
  assert.doesNotMatch(materialProcessingMessage('pending'), /已进入语义记忆/);
});
