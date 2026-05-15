'use strict';


/* ── Modal helpers ──────────────────────────────────── */
function openModal(which){
  // When opening from Home, always target today
  if (S.activeTab === 'home') S.selectedDate = S.today;
  S.modal=which;S.form={};render();
}
function closeModal(){S.modal=null;S.form={};render();}
function closeModalSilent(){S.modal=null;S.form={};}

function deleteEntryRow(isEdit, id) {
  if (!isEdit || !id) return null;
  return h('div',{style:{textAlign:'left',marginBottom:'8px'}},
    h('button',{
      style:{background:'none',border:'none',color:'var(--muted)',fontSize:'12px',
        cursor:'pointer',padding:'4px 0',fontFamily:"'DM Sans',sans-serif",
        textDecoration:'underline',opacity:'0.6'},
      onclick:()=>{ closeModal(); setTimeout(()=>delEntry(id), 50); }
    },'Delete this entry')
  );
}
function overlay(content) {
  const ov=h('div',{class:'overlay'},h('div',{class:'sheet'},h('div',{class:'sheet-handle'}),content));
  const openedAt = Date.now();
  ov.addEventListener('click',e=>{
    if(e.target===ov && Date.now()-openedAt>300) closeModal();
  });
  return ov;
}

/* ── Edit entry ─────────────────────────────────────── */
function editEntry(e) {
  S.selectedDate = e.date; // ensure saves go to the entry's original date
  S.form = { _editId: e.id, ...e };
  S.modal = e.category;
  render();
}


function showToast(msg) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:8px 18px;border-radius:20px;font-size:13px;font-family:\'DM Sans\',sans-serif;z-index:9999;pointer-events:none;transition:opacity 0.3s;opacity:0;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 1500);
}

