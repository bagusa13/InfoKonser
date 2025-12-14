/* ============================================================
   INFOKONSER.ID - ENGINE V2 (BUG FIX & OPTIMIZATION)
   FIX: Google Maps URL & Removed duplicated HTML elements.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, query, orderBy, onSnapshot, getDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"; 

// --- CONFIG FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyB2qifqZl1IWKX3YFwc6rxObkww-GHhOIM", 
    authDomain: "infokonser-app.firebaseapp.com",
    projectId: "infokonser-app",
    storageBucket: "infokonser-app.firebasestorage.app",
    messagingSenderId: "546196676464",
    appId: "1:546196676464:web:687013cf50c83e7855f9b5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const dbCollection = collection(db, "concerts"); 

// GLOBAL VARIABLES
let concerts = []; 
let wishlist = JSON.parse(localStorage.getItem('infokonser_wishlist')) || [];
let currentLimit = 12; // LIMIT AWAL (V3 Feature)
let currentData = [];  // Data yang sedang aktif

// --- MAIN ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    // Jalankan fitur tambahan (Preloader, BackToTop, TogglePass)
    setupAddons();

    if (document.getElementById('concertContainer')) {
        initPublicPage();
    } else if (document.getElementById('loginForm') || document.getElementById('adminPanel')) {
        initAdminPage();
    }
});

/* ============================================================
   BAGIAN 1: PUBLIC PAGE LOGIC
   ============================================================ */
function initPublicPage() {
    const container = document.getElementById('concertContainer');
    const q = query(dbCollection, orderBy("rawDate", "asc"));
    
    // Skeleton Loading Sederhana
    container.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1; padding:50px;">Memuat data...</div>';

    setupSearch();
    setupFilters();
    setupPopupLogic();

    // LISTENER TOMBOL LOAD MORE (V3 Logic)
    const btnLoad = document.getElementById('btnLoadMore');
    if(btnLoad) {
        btnLoad.addEventListener('click', () => {
            currentLimit += 12; // Tambah 12 data lagi
            renderGrid(currentData, true); // Render ulang (mode append)
        });
    }

    // LISTENER KLIK KARTU (Detail & Wishlist)
    container.addEventListener('click', (e) => {
        const wishBtn = e.target.closest('.btn-wishlist');
        if (wishBtn) { e.stopPropagation(); toggleWishlist(wishBtn.dataset.id); return; }

        const detailBtn = e.target.closest('.btn-card-action');
        if (detailBtn && !detailBtn.hasAttribute('disabled')) { showPopup(detailBtn.dataset.id); }
    });

    // REALTIME LISTENER
    onSnapshot(q, (snapshot) => {
        concerts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        currentData = concerts;
        applyFilter('all');
    }, (err) => {
        container.innerHTML = `<div style="text-align:center; padding:50px;">Gagal memuat data.</div>`;
    });
}

// RENDER GRID DENGAN LIMIT (V3 Logic)
function renderGrid(data, isLoadMore = false) {
    const container = document.getElementById('concertContainer');
    const loadContainer = document.getElementById('loadMoreContainer');
    
    // Jika bukan load more (misal filter baru), reset container & limit
    if (!isLoadMore) {
        currentLimit = 12;
        container.innerHTML = "";
    } else {
        container.innerHTML = "";
    }

    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; grid-column:1/-1; opacity:0.5;">Belum ada agenda konser.</div>`;
        if(loadContainer) loadContainer.style.display = 'none';
        return;
    }

    // POTONG DATA SESUAI LIMIT
    const slicedData = data.slice(0, currentLimit);
    
    // V2 Optimization: Gunakan UTC untuk konsistensi waktu selesai event
    const now = new Date(); 
    now.setUTCHours(0,0,0,0);

    slicedData.forEach((c, index) => {
        const startDate = new Date(c.rawDate);
        const isFinished = startDate < now;
        
        let badge = "";
        let btnState = `data-id="${c.id}">Lihat Detail`;
        
        if (isFinished) {
            badge = `<div class="status-badge" style="background:#333; color:#888; border-color:#555;">SELESAI</div>`;
            btnState = `disabled>Event Berakhir`;
        } else if (c.status === 'sold-out') {
            badge = `<div class="status-badge" style="background:#ef4444; border-color:#ef4444;">SOLD OUT</div>`;
        } else if (c.status === 'limited') {
            badge = `<div class="status-badge" style="background:#f59e0b; color:black; border-color:#f59e0b;">LIMITED</div>`;
        }

        const isLoved = wishlist.includes(c.id);
        const heartIcon = isLoved ? "fa-solid fa-heart" : "fa-regular fa-heart";
        const heartActive = isLoved ? "active" : "";

        // Animasi delay bertingkat
        const delay = index * 0.05;

        const html = `
        <article class="card" style="animation-delay: ${delay}s">
            <div class="card-img-wrap">
                ${badge}
                <button class="btn-wishlist ${heartActive}" data-id="${c.id}"><i class="${heartIcon}"></i></button>
                <img src="${c.image}" loading="lazy" onerror="this.src='https://placehold.co/600x400/111/333?text=No+Image'">
            </div>
            <div class="card-content">
                <div class="card-genre">${c.genre || 'MUSIC'}</div>
                <h3>${c.name}</h3>
                <div class="card-details">
                    <div class="detail-row"><i class="far fa-calendar"></i> ${formatDateIndo(startDate)}</div>
                    <div class="detail-row"><i class="fas fa-map-marker-alt"></i> ${c.city}</div>
                    <div class="detail-row"><i class="fas fa-tag"></i> ${c.price || 'TBA'}</div>
                </div>
                <button class="btn-card-action" ${btnState}</button>
            </div>
        </article>`;
        container.innerHTML += html;
    });

    // LOGIC TOMBOL LOAD MORE
    if (slicedData.length < data.length) {
        if(loadContainer) loadContainer.style.display = 'block';
    } else {
        if(loadContainer) loadContainer.style.display = 'none';
    }
}

// FILTER & SEARCH
function setupSearch() {
    const input = document.getElementById('searchInput');
    if(!input) return;
    
    let timeout;
    input.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            const term = e.target.value.toLowerCase();
            const filtered = concerts.filter(c => c.name.toLowerCase().includes(term) || c.city.toLowerCase().includes(term));
            currentData = filtered; 
            renderGrid(filtered);
        }, 300);
    });
}

function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            applyFilter(e.currentTarget.dataset.filter);
        });
    });
}

function applyFilter(filter) {
    let res = (filter === 'all') ? concerts : 
              (filter === 'FAVORITE') ? concerts.filter(c => wishlist.includes(c.id)) : 
              concerts.filter(c => c.genre === filter);
    currentData = res; 
    renderGrid(res);
}

// WISHLIST
function toggleWishlist(id) {
    const idx = wishlist.indexOf(id);
    if (idx === -1) { wishlist.push(id); showToast("❤️ Masuk Favorit"); } 
    else { wishlist.splice(idx, 1); showToast("💔 Dihapus dari Favorit"); }
    
    localStorage.setItem('infokonser_wishlist', JSON.stringify(wishlist));
    
    const btn = document.querySelector(`.btn-wishlist[data-id="${id}"]`);
    if(btn) {
        btn.classList.toggle('active');
        btn.innerHTML = wishlist.includes(id) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    }
    
    const activeFilter = document.querySelector('.filter-btn.active');
    if(activeFilter && activeFilter.dataset.filter === 'FAVORITE') {
        applyFilter('FAVORITE');
    }
}

// POPUP DETAIL (V2 Fixed: Correct Maps URL)
function showPopup(id) {
    const c = concerts.find(x => x.id === id);
    if (!c) return;

    const popup = document.getElementById('eventPopup');
    const content = document.getElementById('popupContent');
    
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('active'), 10);

    // V2 BUG FIX: KOREKSI GOOGLE MAPS EMBED URL
    const mapQuery = encodeURIComponent(`${c.venue}, ${c.city}`);
    const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    const mapLinkUrl = `https://maps.google.com/maps?q=${mapQuery}&z=15`;


    content.innerHTML = `
        <div style="margin-bottom:20px;">
            <span style="color:var(--primary); font-weight:700; letter-spacing:1px; text-transform:uppercase;">${c.genre}</span>
            <h2 style="font-family:var(--font-head); font-size:2rem; margin-top:5px; color:white;">${c.name}</h2>
        </div>
        
        <div style="display:grid; gap:15px; margin-bottom:25px; border-top:1px solid var(--border); padding-top:20px;">
             <div class="detail-row"><span style="width:80px;">Tanggal</span> <span style="color:white;">${formatDateIndo(new Date(c.rawDate))}</span></div>
             <div class="detail-row"><span style="width:80px;">Lokasi</span> <span style="color:white;">${c.venue}, ${c.city}</span></div>
             <div class="detail-row"><span style="width:80px;">Tiket</span> <span style="color:var(--primary); font-weight:600;">${c.price}</span></div>
             <div class="detail-row"><span style="width:80px;">Waktu</span> <span style="color:white;">${c.time || 'Open Gate'} ${c.timezone || 'WIB'}</span></div>
        </div>

        <p style="color:#ccc; line-height:1.6; margin-bottom:25px; font-size:0.95rem;">${c.desc}</p>
        
        <div class="map-container">
            <iframe 
                width="100%" 
                height="150" 
                frameborder="0" 
                scrolling="no" 
                marginheight="0" 
                marginwidth="0" 
                src="${mapEmbedUrl}"
                style="filter: invert(90%) hue-rotate(180deg);">
            </iframe>
            <a href="${mapLinkUrl}" target="_blank" class="map-link-btn">
                <i class="fas fa-external-link-alt"></i> Buka di Google Maps App
            </a>
        </div>

        <div style="display:grid; grid-template-columns:1fr; gap:10px;">
            <button id="shareBtn" class="btn-card-action" style="margin:0; background:white; color:black;">
                <i class="fas fa-share-alt"></i> Share Event
            </button>
        </div>
    `;

    document.getElementById('shareBtn').addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({ title: c.name, text: `Yuk nonton ${c.name} di ${c.city}!`, url: window.location.href });
        } else {
            navigator.clipboard.writeText(window.location.href);
            showToast("🔗 Link berhasil disalin!");
        }
    });
}

function setupPopupLogic() {
    const popup = document.getElementById('eventPopup');
    document.getElementById('closePopupBtn').addEventListener('click', () => {
        popup.classList.remove('active');
        setTimeout(() => popup.classList.add('hidden'), 300);
    });
}

// --- V3 ADDONS ---
function setupAddons() {
    // 1. Preloader Smooth Fade Out
    window.addEventListener('load', () => {
        const preloader = document.getElementById('preloader');
        if(preloader) {
            setTimeout(() => {
                preloader.classList.add('hide'); 
            }, 800); 
        }
    });

    // 2. Back To Top
    const backBtn = document.getElementById('backToTop');
    if(backBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) backBtn.classList.add('show');
            else backBtn.classList.remove('show');
        });
    }

    // 3. Toggle Password (Admin)
    const toggleBtn = document.getElementById('togglePass');
    const passInput = document.getElementById('password');
    if(toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            toggleBtn.classList.toggle('fa-eye');
            toggleBtn.classList.toggle('fa-eye-slash');
        });
    }
}

// UTILS
function formatDateIndo(date) {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const txt = document.getElementById('toastMsg');
    txt.innerText = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ============================================================
   BAGIAN 2: ADMIN PAGE LOGIC
   ============================================================ */
function initAdminPage() {
    const loginView = document.getElementById('loginView');
    const adminPanel = document.getElementById('adminPanel');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            loginView.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            loadAdminData();
            setupAdminForm();
        } else {
            loginView.classList.remove('hidden');
            adminPanel.classList.add('hidden');
        }
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('username').value;
            const pass = document.getElementById('password').value;
            const btn = loginForm.querySelector('button');
            
            btn.innerText = "Verifikasi Login...";
            btn.disabled = true;

            signInWithEmailAndPassword(auth, email, pass)
                .then(() => showToast("SELAMAT DATANG!"))
                .catch((err) => alert("Login Gagal: " + err.message))
                .finally(() => { btn.innerText = "LOGIN"; btn.disabled = false; });
        });
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        if(confirm("Logout?")) signOut(auth);
    });
}

function setupAdminForm() {
    // Format Rupiah
    const priceInput = document.getElementById('concertPrice');
    if(priceInput) {
        priceInput.addEventListener('keyup', function(e) {
            let val = this.value.replace(/\D/g, '');
            if(val !== "") this.value = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
        });
    }

    // Upload Gambar ke ImgBB
    const imgInput = document.getElementById('imageInput');
    if(imgInput) {
        imgInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            document.getElementById('uploadStatus').innerText = "⏳Sedang Mengupload...";
            
            const formData = new FormData();
            formData.append("image", file);
            
            try {
                // Perhatian: API Key terekspos di frontend. Disarankan menggunakan Cloud Functions.
                const req = await fetch(`https://api.imgbb.com/1/upload?key=9e0e15208bce06ac4de7373c4a2ef82c`, { method:'POST', body:formData });
                const res = await req.json();
                if(res.success) {
                    const link = res.data.display_url;
                    document.getElementById('concertImage').value = link;
                    document.getElementById('imagePreview').innerHTML = `<img src="${link}" style="width:100%; border-radius:10px;">`;
                    document.getElementById('uploadStatus').innerText = "✅ Selamat Upload Image Berhasil";
                }
            } catch(err) { document.getElementById('uploadStatus').innerText = "❌ Gagal Upload"; }
        });
    }

    // Submit Form (Add/Edit)
    const form = document.getElementById('concertForm');
    if(form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('editId').value;
            const img = document.getElementById('concertImage').value || document.getElementById('oldImage').value;
            
            if(!img) { alert("Wajib upload poster!"); return; }

            const data = {
                name: document.getElementById('bandName').value,
                city: document.getElementById('concertCity').value.toUpperCase(),
                venue: document.getElementById('concertVenue').value,
                genre: document.getElementById('concertGenre').value,
                rawDate: document.getElementById('concertDateOnly').value,
                time: document.getElementById('concertTimeOnly').value,
                timezone: document.getElementById('concertTimezone').value,
                duration: document.getElementById('concertDuration').value,
                price: document.getElementById('concertPrice').value,
                status: document.getElementById('concertStatus').value,
                desc: document.getElementById('concertDetail').value,
                image: img
            };

            try {
                if(editId) {
                    await updateDoc(doc(db, "concerts", editId), data);
                    showToast("✏️ Data Diupdate!");
                } else {
                    data.createdAt = new Date();
                    await addDoc(dbCollection, data);
                    showToast("🚀 Data Terbit!");
                }
                setTimeout(() => location.reload(), 1500);
            } catch(err) { alert("Error: " + err.message); }
        });
    }

    document.getElementById('cancelEditBtn').addEventListener('click', () => location.reload());
}

function loadAdminData() {
    const tbody = document.getElementById('adminConcerts');
    const q = query(dbCollection, orderBy("rawDate", "desc"));
    
    onSnapshot(q, (snap) => {
        if(document.getElementById('statTotal')) {
            const total = snap.size;
            const sold = snap.docs.filter(d => d.data().status === 'sold-out').length;
            const active = total - sold;

            document.getElementById('statTotal').innerText = total;
            document.getElementById('statSold').innerText = sold;
            document.getElementById('statActive').innerText = active;
        }

        tbody.innerHTML = "";
        snap.forEach(docSnap => {
        const d = docSnap.data();

    // Status Color
    const statusColor = d.status === 'sold-out' ? '#ef4444' : 'var(--primary)';

    tbody.innerHTML += `
    <tr>
        <td><img src="${d.image}" width="50" style="border-radius:6px;"></td>
        <td>
            <div style="font-weight:bold; color:white;">${d.name}</div>
            <div style="font-size:0.8rem; color:#888;">${d.city} • ${d.rawDate}</div>
            
            <div style="font-size:0.7rem; color:${statusColor}; font-weight:bold;">${d.status.toUpperCase()}</div>
        </td>
        <td style="text-align:right;">
            <button onclick="editEvent('${docSnap.id}')" style="color:var(--primary); background:rgba(255,255,255,0.05); padding:5px 10px; border-radius:5px; border:none; cursor:pointer; margin-right:5px;">Edit</button>
            <button onclick="delEvent('${docSnap.id}')" style="color:#ef4444; background:rgba(255,255,255,0.05); padding:5px 10px; border-radius:5px; border:none; cursor:pointer;">Hapus</button>
        </td>
    </tr>`;
        });
    });
}

// FUNGSI GLOBAL
window.delEvent = async (id) => {
    if(confirm("Yakin menghapus permanen?")) {
        await deleteDoc(doc(db, "concerts", id));
        showToast("🗑️ Data Berhasil Dihapus");
    }
};

window.editEvent = async (id) => {
    const snap = await getDoc(doc(db, "concerts", id));
    if(snap.exists()) {
        const d = snap.data();
        document.getElementById('editId').value = id;
        document.getElementById('oldImage').value = d.image;
        document.getElementById('bandName').value = d.name;
        document.getElementById('concertCity').value = d.city;
        document.getElementById('concertVenue').value = d.venue;
        document.getElementById('concertGenre').value = d.genre;
        document.getElementById('concertDateOnly').value = d.rawDate;
        document.getElementById('concertTimeOnly').value = d.time;
        document.getElementById('concertPrice').value = d.price;
        document.getElementById('concertStatus').value = d.status;
        document.getElementById('concertDetail').value = d.desc;
        
        document.getElementById('imagePreview').innerHTML = `<img src="${d.image}" style="width:100%;">`;
        document.getElementById('formTitle').innerText = "Edit Event: " + d.name;
        document.getElementById('submitBtn').innerText = "Simpan Perubahan";
        document.getElementById('cancelEditBtn').style.display = "inline-block";
        
        document.getElementById('adminPanel').scrollIntoView({behavior:'smooth'});
    }
};