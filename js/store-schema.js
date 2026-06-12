(function () {
  // Single source of truth for the data model. For each key:
  //   default — the initial value for a fresh install (store.js derives DEFAULTS)
  //   sync    — Firestore strategy: 'subcol' = per-item docs in a subcollection;
  //             'maindoc' = one merged document; 'topics' = special per-topic docs
  //             (firebase-sync.js derives SUBCOL_KEYS / MAIN_DOC_KEYS from this,
  //              guarded by a hard assertion against the known-correct sets)
  //   merge   — documentation of the merge rule (the actual logic lives in
  //             firebase-sync.js mergeByKey and is intentionally NOT derived here)
  //
  // Order matters: subcol keys first, then maindoc keys, so the derived
  // SUBCOL_KEYS / MAIN_DOC_KEYS arrays match the original order exactly.
  window.StoreSchema = {
    notes:        { default: [],                               sync: 'subcol',  merge: 'by-id' },
    tasks:        { default: [],                               sync: 'subcol',  merge: 'by-id' },
    todos:        { default: [],                               sync: 'subcol',  merge: 'by-id' },
    goals:        { default: [],                               sync: 'subcol',  merge: 'by-id' },
    transactions: { default: [],                               sync: 'subcol',  merge: 'by-id' },
    customTemplates: { default: [],                            sync: 'subcol',  merge: 'by-id' },
    readingList:  { default: [],                               sync: 'subcol',  merge: 'by-id' },
    flashcards:   { default: [],                               sync: 'subcol',  merge: 'by-id' },
    mood:         { default: {},                               sync: 'maindoc', merge: 'cloud-wins' },
    water:        { default: {},                               sync: 'maindoc', merge: 'cloud-wins' },
    sleep:        { default: {},                               sync: 'maindoc', merge: 'cloud-wins' },
    slots:        { default: {},                               sync: 'maindoc', merge: 'shallow' },
    settings:     { default: { userName: '', theme: 'cream' }, sync: 'maindoc', merge: 'cloud-wins' },
    habits:       { default: [
                      { id: 'h1', name: 'לקרוא 20 דקות', color: 'sage',     log: {} },
                      { id: 'h2', name: 'פעילות גופנית', color: 'blush',    log: {} },
                      { id: 'h3', name: 'מדיטציה',       color: 'lavender', log: {} }
                    ],                                          sync: 'maindoc', merge: 'log-deep-merge' },
    eisenhower:   { default: {},                               sync: 'maindoc', merge: 'shallow' },
    weeklyReviews:{ default: {},                               sync: 'maindoc', merge: 'shallow' },
    topics:       { default: [],                               sync: 'topics',  merge: 'by-id' }
  };
})();
