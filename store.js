/* store.js — 把素材存在手機（IndexedDB），重新整理也不會消失 */
(function () {
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      const r = indexedDB.open('tengye-video', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('media', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function run(mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction('media', mode);
      const req = fn(tx.objectStore('media'));
      tx.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error('儲存空間不足'));
    });
  }
  window.Store = {
    put: rec => run('readwrite', s => s.put(rec)),
    del: id => run('readwrite', s => s.delete(id)),
    all: () => run('readonly', s => s.getAll()),
    clear: () => run('readwrite', s => s.clear())
  };
})();
