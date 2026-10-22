import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderScheduler } from '../server/scheduler.mjs';

test('busy provider serves higher priorities first while preserving FIFO among equals and capacity',async () => {
  const queue=createProviderScheduler(1);
  const releaseFirst=await queue.acquire(0);
  const order=[];
  const low=queue.acquire(1).then(release => {order.push('low');return release;});
  const high=queue.acquire(3).then(release => {order.push('high');return release;});
  const highAgain=queue.acquire(3).then(release => {order.push('high-again');return release;});
  assert.deepEqual(order,[]);
  releaseFirst();
  const releaseHigh=await high;
  assert.deepEqual(order,['high']);
  releaseFirst(); // An accidental duplicate release must not open another provider slot.
  await Promise.resolve();
  assert.deepEqual(order,['high']);
  releaseHigh();
  const releaseAgain=await highAgain;
  assert.deepEqual(order,['high','high-again']);
  releaseAgain();
  const releaseLow=await low;
  assert.deepEqual(order,['high','high-again','low']);
  releaseLow();queue.close();
});

test('queue is bounded and canceled waiters free their queue position',async () => {
  const queue=createProviderScheduler(1,1);
  const release=await queue.acquire();
  const controller=new AbortController();
  const canceled=queue.acquire(0,controller.signal);
  const checkCanceled=assert.rejects(canceled,/ticket canceled/);
  await assert.rejects(queue.acquire(5),{code:'PROVIDER_QUEUE_FULL'});
  controller.abort(new Error('ticket canceled'));
  await checkCanceled;
  const next=queue.acquire(0);
  release();
  (await next)();queue.close();
});

test('closing scheduler cancels waiting tickets and rejects new tickets without leaking a slot',async () => {
  const queue=createProviderScheduler(1);
  const release=await queue.acquire();
  const pending=queue.acquire();
  const check=assert.rejects(pending,{code:'PROVIDER_SHUTDOWN'});
  queue.close();await check;
  await assert.rejects(queue.acquire(),{code:'PROVIDER_SHUTDOWN'});
  release();release();
});

test('waiting time raises an old ticket above newer higher-priority work',async () => {
  const queue=createProviderScheduler(1);
  const now=Date.now;
  try {
    let clock=now();Date.now=() => clock;
    const release=await queue.acquire();
    const low=queue.acquire(0);
    clock+=120_000;
    const high=queue.acquire(3);
    release();
    const releaseLow=await low;
    releaseLow();(await high)();
  } finally {Date.now=now;queue.close();}
});
