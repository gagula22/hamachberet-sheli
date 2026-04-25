(function () {
  const STICKERS = [
    '🌸','🌼','🌿','🍃','🌱','🌻','🌷','🌹','💐','🌺',
    '⭐','✨','💫','🌟','☀️','🌈','☁️','🌙','⚡','🔥',
    '❤️','💖','💗','💝','💘','🧡','💛','💚','💙','💜',
    '☕','🍵','🥐','🍰','🍓','🍑','🍊','🫐','🍋','🥥',
    '📖','📝','✏️','🖊️','📌','📎','🎀','🎁','🕯️','🍭'
  ];

  function render(root) {
    root.append(
      App.el('div', { class: 'stack stack-lg' }, [
        App.el('div', { class: 'card' }, [
          App.el('div', { class: 'row row-between' }, [
            App.el('h2', {}, 'ספריית מדבקות'),
            App.el('span', { class: 'chip lavender' }, `${STICKERS.length} מדבקות · לחץ להעתקה`)
          ]),
          App.el('div', { class: 'stickers', style: { marginTop: '16px' } },
            STICKERS.map(s => App.el('div', {
              class: 'sticker',
              onClick: async () => {
                try { await navigator.clipboard.writeText(s); App.toast(`${s} הועתק`); }
                catch { App.toast(s + ' ← לחץ והחזק להעתקה'); }
              }
            }, s))
          )
        ]),
        App.el('div', { class: 'card' }, [
          App.el('h3', {}, 'טיפ'),
          App.el('p', { style: { color: 'var(--ink-soft)', lineHeight: '1.6', margin: 0 } },
            'לחץ על מדבקה כדי להעתיק אותה — ואז הדבק בהערה, במטרה, או בכל מקום שתרצה להוסיף בו קצת שמחה ✿')
        ])
      ])
    );
  }

  App.register('stickers', render);
})();
