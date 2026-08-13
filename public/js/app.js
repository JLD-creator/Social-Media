const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let currentPage = 1;
let currentTag = '';
let currentSearch = '';

function authHeaders(){ return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }; }

// ---------- VIEW NAV ----------
function switchView(id){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goHome(){ switchView('view-feed'); loadFeed(); history.pushState({}, '', '/'); }

// ---------- AUTH ----------
function openAuthModal(){ document.getElementById('auth-modal').style.display = 'flex'; }
function closeAuthModal(){ document.getElementById('auth-modal').style.display = 'none'; }
function showRegisterModal(){ document.getElementById('login-form').style.display='none'; document.getElementById('register-form').style.display='block'; }
function showLoginModal(){ document.getElementById('register-form').style.display='none'; document.getElementById('login-form').style.display='block'; }

async function register(){
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  try{
    const res = await fetch(`${API}/auth/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, email, password }) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error);
    onAuthSuccess(data);
  }catch(e){ errEl.textContent = e.message; }
}

async function login(){
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try{
    const res = await fetch(`${API}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error);
    onAuthSuccess(data);
  }catch(e){ errEl.textContent = e.message; }
}

function onAuthSuccess(data){
  token = data.token;
  localStorage.setItem('token', token);
  currentUser = data.user;
  closeAuthModal();
  renderTopbarAuth();
  loadFeed();
}

function logout(){
  localStorage.removeItem('token');
  token = null; currentUser = null;
  renderTopbarAuth();
  goHome();
}

function renderTopbarAuth(){
  const el = document.getElementById('topbar-auth');
  if(currentUser){
    el.innerHTML = `
      ${currentUser.role === 'mod' ? `<button class="btn-ghost" onclick="openModPanel()">mod</button>` : ''}
      <span class="mono" style="color:var(--text-muted);font-size:13px;cursor:pointer" onclick="openProfile('${currentUser.username}')">@${currentUser.username}</span>
      <button class="btn-link" onclick="logout()">salir</button>
    `;
  } else {
    el.innerHTML = `<button class="btn-ghost" onclick="openAuthModal()">entrar</button>`;
  }
}

// ---------- FEED ----------
async function loadFeed(){
  const params = new URLSearchParams({ page: currentPage });
  if(currentTag) params.set('tag', currentTag);
  if(currentSearch) params.set('search', currentSearch);

  const res = await fetch(`${API}/posts?${params}`, { headers: authHeaders() });
  const data = await res.json();

  const list = document.getElementById('feed-list');
  list.innerHTML = data.posts.map(p => `
    <div class="post-card" onclick="openPost(${p.id})">
      <div class="post-card-top">
        <span class="post-tag">#${p.tag}</span>
        <span>@${p.author}</span>
        <span>·</span>
        <span>${timeAgo(p.created_at)}</span>
      </div>
      <div class="post-title">${escapeHtml(p.title)}</div>
      <div class="post-excerpt">${escapeHtml(p.content)}</div>
      <div class="post-meta">
        <span class="${p.liked_by_me ? 'liked' : ''}">♥ ${p.like_count}</span>
        <span>💬 ${p.comment_count}</span>
      </div>
    </div>
  `).join('') || `<p style="color:var(--text-muted);padding:40px 0;text-align:center">No hay posts todavía. ¡Sé el primero en publicar!</p>`;

  renderPagination(data.page, data.totalPages);
  renderTagFilters();
}

function renderPagination(page, totalPages){
  const el = document.getElementById('pagination');
  if(totalPages <= 1){ el.innerHTML = ''; return; }
  let html = '';
  for(let i = 1; i <= totalPages; i++){
    html += `<button class="${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  el.innerHTML = html;
}
function goToPage(p){ currentPage = p; loadFeed(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

const TAGS = ['general','javascript','python','backend','frontend','devops','carrera'];
function renderTagFilters(){
  const el = document.getElementById('tag-filters');
  el.innerHTML = `<button class="tag-chip ${!currentTag ? 'active':''}" onclick="filterTag('')">todos</button>` +
    TAGS.map(t => `<button class="tag-chip ${currentTag===t?'active':''}" onclick="filterTag('${t}')">#${t}</button>`).join('');
}
function filterTag(tag){ currentTag = tag; currentPage = 1; loadFeed(); }
function doSearch(){ currentSearch = document.getElementById('search-input').value.trim(); currentPage = 1; loadFeed(); switchView('view-feed'); }

// ---------- POST DETAIL ----------
async function openPost(id){
  const res = await fetch(`${API}/posts/${id}`, { headers: authHeaders() });
  if(!res.ok) return;
  const post = await res.json();
  switchView('view-post');
  renderPostDetail(post);
}

function renderPostDetail(post){
  const canDelete = currentUser && (currentUser.id === post.author_id || currentUser.role === 'mod');
  document.getElementById('post-detail').innerHTML = `
    <div class="post-detail-header">
      <div class="post-card-top">
        <span class="post-tag">#${post.tag}</span>
        <span class="author-link" onclick="openProfile('${post.author}')">@${post.author}</span>
        <span>·</span><span>${timeAgo(post.created_at)}</span>
      </div>
      <h1 class="post-detail-title">${escapeHtml(post.title)}</h1>
    </div>
    <div class="post-detail-body">${escapeHtml(post.content)}</div>
    <div class="post-actions">
      <button class="like-btn ${post.liked ? 'liked' : ''}" onclick="toggleLike(${post.id})">♥ <span id="like-count">${post.like_count}</span></button>
      ${currentUser ? `<button class="btn-ghost" onclick="reportPost(${post.id})">reportar</button>` : ''}
      ${canDelete ? `<button class="btn-ghost" onclick="deletePost(${post.id})">eliminar</button>` : ''}
    </div>
    <div class="comments-section">
      <h3 style="margin-bottom:14px">comentarios (${countComments(post.comments)})</h3>
      ${currentUser ? `
        <div class="comment-form">
          <textarea id="new-comment" placeholder="escribe un comentario..." rows="3"></textarea>
          <button class="btn-primary" onclick="submitComment(${post.id}, null)">comentar</button>
        </div>
      ` : `<p style="color:var(--text-muted);font-size:13px">Inicia sesión para comentar.</p>`}
      <div id="comments-list">${renderComments(post.comments, post.id)}</div>
    </div>
  `;
}

function countComments(list){
  return list.reduce((acc, c) => acc + 1 + countComments(c.replies || []), 0);
}

function renderComments(list, postId){
  return list.map(c => `
    <div class="comment">
      <div class="comment-top">
        <span class="comment-author">@${c.author}</span>
        <span class="comment-time">${timeAgo(c.created_at)}</span>
      </div>
      <div class="comment-content">${escapeHtml(c.content)}</div>
      <div class="comment-actions">
        ${currentUser ? `<button onclick="toggleReplyBox(${c.id})">responder</button>` : ''}
        ${currentUser && (currentUser.id === c.user_id || currentUser.role === 'mod') ? `<button onclick="deleteComment(${c.id}, ${postId})">eliminar</button>` : ''}
      </div>
      <div class="reply-box" id="reply-box-${c.id}" style="display:none">
        <textarea id="reply-text-${c.id}" rows="2" placeholder="responder a @${c.author}..."></textarea>
        <button class="btn-ghost" onclick="submitComment(${postId}, ${c.id})">enviar</button>
      </div>
      <div class="replies">${renderComments(c.replies || [], postId)}</div>
    </div>
  `).join('');
}

function toggleReplyBox(commentId){
  const box = document.getElementById(`reply-box-${commentId}`);
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function submitComment(postId, parentId){
  const textEl = parentId ? document.getElementById(`reply-text-${parentId}`) : document.getElementById('new-comment');
  const content = textEl.value.trim();
  if(!content) return;
  await fetch(`${API}/posts/${postId}/comments`, {
    method:'POST', headers: authHeaders(),
    body: JSON.stringify({ content, parent_comment_id: parentId })
  });
  openPost(postId);
}

async function deleteComment(id, postId){
  if(!confirm('¿Eliminar este comentario?')) return;
  await fetch(`${API}/comments/${id}`, { method:'DELETE', headers: authHeaders() });
  openPost(postId);
}

async function toggleLike(postId){
  if(!currentUser) return openAuthModal();
  const res = await fetch(`${API}/posts/${postId}/like`, { method:'POST', headers: authHeaders() });
  const data = await res.json();
  document.getElementById('like-count').textContent = data.like_count;
  document.querySelector('.like-btn').classList.toggle('liked', data.liked);
}

async function deletePost(id){
  if(!confirm('¿Eliminar este post?')) return;
  await fetch(`${API}/posts/${id}`, { method:'DELETE', headers: authHeaders() });
  goHome();
}

async function reportPost(id){
  const reason = prompt('¿Por qué reportas este post? (opcional)') || '';
  await fetch(`${API}/posts/${id}/report`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ reason }) });
  alert('Post reportado. Gracias por ayudar a mantener la comunidad sana.');
}

// ---------- NEW POST ----------
function openPostModal(){
  if(!currentUser) return openAuthModal();
  document.getElementById('post-modal').style.display = 'flex';
}
function closePostModal(){
  document.getElementById('post-modal').style.display = 'none';
  document.getElementById('post-title').value = '';
  document.getElementById('post-content').value = '';
}
async function submitPost(){
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  const tag = document.getElementById('post-tag').value;
  if(!title || !content) return alert('Completa título y contenido');
  const res = await fetch(`${API}/posts`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ title, content, tag }) });
  const data = await res.json();
  closePostModal();
  openPost(data.id);
}

// ---------- PROFILE ----------
async function openProfile(username){
  const res = await fetch(`${API}/users/${username}`, { headers: authHeaders() });
  if(!res.ok) return;
  const profile = await res.json();
  switchView('view-profile');
  const isMe = currentUser && currentUser.username === username;
  document.getElementById('profile-detail').innerHTML = `
    <div class="profile-header">
      <div>
        <div class="profile-username">@${profile.username} ${profile.role === 'mod' ? '<span class="mono" style="color:var(--amber);font-size:12px">MOD</span>' : ''}</div>
        <div class="profile-bio">${escapeHtml(profile.bio || 'Sin biografía todavía.')}</div>
        <div class="profile-stats">
          <span>${profile.followers} seguidores</span>
          <span>${profile.following} siguiendo</span>
          <span>${profile.posts.length} posts</span>
        </div>
      </div>
      ${!isMe && currentUser ? `<button class="btn-primary" onclick="toggleFollow('${username}')">${profile.isFollowing ? 'siguiendo' : 'seguir'}</button>` : ''}
    </div>
    <div class="profile-posts">
      ${profile.posts.map(p => `
        <div class="post-card" onclick="openPost(${p.id})">
          <div class="post-card-top"><span class="post-tag">#${p.tag}</span><span>${timeAgo(p.created_at)}</span></div>
          <div class="post-title">${escapeHtml(p.title)}</div>
          <div class="post-meta"><span>♥ ${p.like_count}</span></div>
        </div>
      `).join('') || '<p style="color:var(--text-muted)">Sin posts todavía.</p>'}
    </div>
  `;
}

async function toggleFollow(username){
  await fetch(`${API}/users/${username}/follow`, { method:'POST', headers: authHeaders() });
  openProfile(username);
}

// ---------- MOD PANEL ----------
async function openModPanel(){
  switchView('view-mod');
  const res = await fetch(`${API}/mod/reports`, { headers: authHeaders() });
  const reports = await res.json();
  document.getElementById('mod-reports').innerHTML = reports.map(r => `
    <div class="report-item">
      <div class="report-info">
        Post: <b>${escapeHtml(r.post_title)}</b> · reportado por @${r.reporter}
        ${r.reason ? `<br>Motivo: ${escapeHtml(r.reason)}` : ''}
      </div>
      <button class="btn-ghost" onclick="removeReportedPost(${r.post_id})">eliminar post</button>
    </div>
  `).join('') || '<p style="color:var(--text-muted)">No hay reportes pendientes.</p>';
}
async function removeReportedPost(postId){
  await fetch(`${API}/mod/posts/${postId}/remove`, { method:'POST', headers: authHeaders() });
  openModPanel();
}

// ---------- UTILS ----------
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
function timeAgo(dateStr){
  const diff = (Date.now() - new Date(dateStr + 'Z').getTime()) / 1000;
  if(diff < 60) return 'ahora';
  if(diff < 3600) return `hace ${Math.floor(diff/60)}m`;
  if(diff < 86400) return `hace ${Math.floor(diff/3600)}h`;
  return `hace ${Math.floor(diff/86400)}d`;
}

// ---------- BOOT ----------
async function boot(){
  if(token){
    try{
      const res = await fetch(`${API}/auth/me`, { headers: authHeaders() });
      if(!res.ok) throw new Error();
      currentUser = await res.json();
    }catch{ token = null; localStorage.removeItem('token'); }
  }
  renderTopbarAuth();
  loadFeed();
}
boot();
