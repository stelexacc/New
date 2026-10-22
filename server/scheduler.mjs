// A bounded queue gives plan priorities meaning only while all provider slots are busy.
export function createProviderScheduler(concurrency = 2, maxQueued = 128) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) throw new Error('Provider concurrency must be 1–64.');
  let active = 0;
  let closed = false;
  let sequence = 0;
  const waiting = [];
  const releaseSlot = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      while (waiting.length && active < concurrency) {
        const now = Date.now();
        // Waiting earns one priority level each 30 seconds, preventing starvation.
        waiting.sort((a,b) => (b.priority+(now-b.queuedAt)/30_000)-(a.priority+(now-a.queuedAt)/30_000) || a.order-b.order);
        const next = waiting.shift();
        next.signal?.removeEventListener('abort',next.abort);
        if (next.signal?.aborted) { next.reject(next.signal.reason); continue; }
        active++;
        next.resolve(releaseSlot());
      }
    };
  };
  return {
    acquire(priority = 0,signal) {
      if (closed) {const error=new Error('The AI scheduler is shutting down.');error.code='PROVIDER_SHUTDOWN';return Promise.reject(error);}
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (active < concurrency) { active++; return Promise.resolve(releaseSlot()); }
      if (waiting.length >= maxQueued) { const error = new Error('The AI queue is full. Please retry shortly.');error.code='PROVIDER_QUEUE_FULL';return Promise.reject(error); }
      return new Promise((resolve,reject) => {
        const item={priority,signal,resolve,reject,queuedAt:Date.now(),order:sequence++};
        item.abort=() => {const index=waiting.indexOf(item);if(index!==-1) waiting.splice(index,1);reject(signal.reason);};
        signal?.addEventListener('abort',item.abort,{once:true});
        waiting.push(item);
      });
    },
    close() {
      closed=true;
      const error=new Error('The AI scheduler is shutting down.');error.code='PROVIDER_SHUTDOWN';
      for(const item of waiting.splice(0)) {item.signal?.removeEventListener('abort',item.abort);item.reject(error);}
    },
  };
}
