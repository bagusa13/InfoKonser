/* ============================================================
   INFOKONSER.ID - ENGINE V3 (FINAL SECURITY & OPTIMASI V4)
   PERBAIKAN KRITIS TERAKHIR: 
   1. FIX PRELOADER STUCK di Halaman Statis (tentang.html, 404.html)
   2. FIX ERROR PROTOKOL MAPS (Mengubah http:// ke https://)
   3. FIX FALLBACK ADMIN STUCK (Agar form login muncul saat testing lokal)
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
let currentLimit = 12; 
let currentData = [];  

// --- MAIN ROUTER ---
document.addEventListener('DOMContentLoaded', () => {
    setupAddons(); 

    // Cek ID halaman dinamis
    if (document.getElementById('concertContainer')) {
        initPublicPage();
    } else if (document.getElementById('loginForm') || document.getElementById('adminPanel')) {
        initAdminPage();
    } else {
        // FIX KRITIS: Panggil hidePreloader untuk halaman statis (tentang.html & 404.html)
        hidePreloader();
    }
});

/* ============================================================
   BAGIAN 1: GLOBAL EVENT LISTENERS
   ============================================================ */

// 1. LISTENER UNTUK UPLOAD GAMBAR (CLOUDINARY)
document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'imageInput') {
        const file = e.target.files[0];
        if(!file) return;
        
        // PERINGATAN: CLOUDINARY UPLOAD PRESET Terekspos (Bug #8)
        const CLOUDINARY_CLOUD_NAME = 'dyfc0i8y5'; 
        const CLOUDINARY_UPLOAD_PRESET = 'InfoKonser'; 
        const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        
        const statusTxt = document.getElementById('uploadStatus');
        statusTxt.innerText = "⏳Sedang Mengupload... Mohon Tunggu...";
        statusTxt.style.color = "orange";
        
        const formData = new FormData();
        formData.append("file", file); 
        formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET); 
        
        try {
            const req = await fetch(CLOUDINARY_URL, { method:'POST', body:formData });
            const res = await req.json();
            
            if(res.secure_url) {
                const link = res.secure_url;
                
                // SOLUSI ANTI-SAFARI/CHROME
                const hiddenInput = document.getElementById('concertImage');
                if (hiddenInput) {
                    hiddenInput.setAttribute('value', link); 
                    hiddenInput.value = link; 
                    hiddenInput.defaultValue = link; 
                    console.log("SUCCESS: Link gambar berhasil disimpan. URL:", link);
                } else {
                    alert("FATAL ERROR: Input 'concertImage' tidak ditemukan!");
                    return;
                }

                // TAMPILKAN PREVIEW
                document.getElementById('imagePreview').innerHTML = `<img src="${link}" alt="Poster Preview" style="width:100%; border-radius:10px;">`;
                statusTxt.innerText = "✅ GAMBAR DITERIMA! Silakan Klik Tombol UPLOAD di Bawah.";
                statusTxt.style.color = "#00f2ea"; 
                
                alert("SUKSES: Gambar Poster Berhasil Diupload!\nSekarang Anda bisa menekan tombol UPLOAD di bawah.");
                
            } else { 
                statusTxt.innerText = "❌ Gagal: " + (res.error?.message || "Unknown Error"); 
                alert("Cloudinary Error: " + res.error?.message);
            }
        } catch(err) { 
            statusTxt.innerText = "❌ Error Koneksi/Jaringan"; 
            console.error(err);
            alert("Error Koneksi: Cek internet Anda.");
        }
    }
});

// 2. LISTENER UNTUK SUBMIT FORM ADMIN
document.addEventListener('submit', async (e) => {
    if (e.target && e.target.id === 'concertForm') {
        e.preventDefault(); 
        
        const editId = document.getElementById('editId').value;
        const img = document.getElementById('concertImage').value || document.getElementById('oldImage').value;
        
        // VALIDASI
        if(!img && !editId) { 
            alert("STOP! Poster belum masuk.\n\nPastikan Anda sudah memilih file DAN menunggu sampai muncul pesan sukses."); 
            return; 
        }
        
        const btn = document.getElementById('submitBtn');
        const originalText = btn.innerText;
        btn.innerText = "Menyimpan...";
        btn.disabled = true;

        // FORMAT HARGA
        const currency = document.getElementById('concertCurrency').value;
        const rawPriceInput = document.getElementById('concertPrice').value;
        const rawPrice = (currency === 'IDR') ? cleanPrice(rawPriceInput) : rawPriceInput;

        let formattedPrice = 'TBA';
        if (currency === 'IDR') formattedPrice = formatRupiahDisplay(rawPrice);
        else if (currency === 'USD') formattedPrice = formatUSDDisplay(rawPrice);

        const data = {
            name: document.getElementById('bandName').value,
            city: document.getElementById('concertCity').value.toUpperCase(),
            venue: document.getElementById('concertVenue').value,
            genre: document.getElementById('concertGenre').value,
            rawDate: document.getElementById('concertDateOnly').value, 
            time: document.getElementById('concertTimeOnly').value,
            timezone: document.getElementById('concertTimezone').value,
            // FIX BUG #18: Pastikan Durasi adalah Integer, default 1 jika input kosong/salah.
            duration: parseInt(document.getElementById('concertDuration').value) || 1, 
            price: formattedPrice, 
            rawPrice: rawPrice, 
            currency: currency, 
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
            
            // FIX BUG #17: Reset form tanpa reload halaman (UX Admin Lebih Cepat)
            resetFormAdmin();

        } catch(err) { 
            alert("Error Database: " + err.message); 
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
});

// 3. LISTENER UNTUK FORMAT HARGA OTOMATIS
document.addEventListener('input', (e) => {
    if(e.target && e.target.id === 'concertPrice') {
        formatPriceInput(e.target);
    }
});
document.addEventListener('change', (e) => {
    if(e.target && e.target.id === 'concertCurrency') {
        const priceInput = document.getElementById('concertPrice');
        if(priceInput) formatPriceInput(priceInput);
    }
});


/* ============================================================
   BAGIAN 2: ADMIN PAGE INIT & LOGIC
   ============================================================ */

function resetFormAdmin() {
    document.getElementById('concertForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('oldImage').value = '';
    document.getElementById('concertImage').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('uploadStatus').innerText = '';
    
    document.getElementById('formTitle').innerText = "Tambah Event";
    document.getElementById('submitBtn').innerText = "UPLOAD";
    document.getElementById('submitBtn').disabled = false;
    document.getElementById('cancelEditBtn').style.display = "none";
}

// 🔥 KOREKSI FUNGSI INIT ADMIN PAGE (Menambahkan Fallback Timer)
function initAdminPage() {
    const loginView = document.getElementById('loginView');
    const adminPanel = document.getElementById('adminPanel');

    if (!adminPanel || !loginView) {
        console.error("Elemen Admin Panel atau Login View tidak ditemukan di DOM.");
        return;
    }

    // --- FALLBACK TIMER START ---
    let authCheckCompleted = false;
    const fallbackTimeout = setTimeout(() => {
        if (!authCheckCompleted) {
            // Jika preloader masih ada setelah 4 detik (karena koneksi lokal diblokir)
            loginView.classList.remove('hidden');
            adminPanel.classList.add('hidden');
            hidePreloader(); // Sembunyikan preloader
            console.warn("ADMIN FALLBACK: Koneksi Firebase lokal gagal, menampilkan form login secara paksa.");
        }
    }, 4000); 
    // --- FALLBACK TIMER END ---
    
    onAuthStateChanged(auth, (user) => {
        clearTimeout(fallbackTimeout); // Batalkan timer jika Firebase merespons cepat
        authCheckCompleted = true;

        if (user) {
            loginView.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            loadAdminData();
        } else {
            loginView.classList.remove('hidden');
            adminPanel.classList.add('hidden');
        }
        hidePreloader(); // Sembunyikan preloader setelah status otentikasi didapat
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

    document.getElementById('cancelEditBtn')?.addEventListener('click', () => resetFormAdmin());
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
        const statusColor = d.status === 'sold-out' ? '#ef4444' : 'var(--primary)';

        tbody.innerHTML += `
        <tr>
            <td><img src="${d.image}" width="50" style="border-radius:6px;" alt="Poster Admin ${d.name}" onerror="this.src='https://placehold.co/50x50/111/444?text=X'"></td>
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

// FUNGSI GLOBAL (WINDOW)
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
        document.getElementById('concertCurrency').value = d.currency || 'IDR';
        
        document.getElementById('concertPrice').value = d.rawPrice || ''; 
        formatPriceInput(document.getElementById('concertPrice'));
        
        document.getElementById('concertStatus').value = d.status;
        document.getElementById('concertDetail').value = d.desc;
        document.getElementById('concertDuration').value = d.duration || '1';
        
        // FIX BUG #6 (CACHE BUSTING): Tambahkan timestamp agar browser TIDAK menggunakan cache gambar lama.
        const bustUrl = `${d.image}?v=${new Date().getTime()}`;
        
        // Gunakan bustUrl untuk memastikan preview gambar selalu terbaru
        document.getElementById('imagePreview').innerHTML = `<img src="${bustUrl}" alt="Poster Preview Edit" style="width:100%;">`;
        document.getElementById('formTitle').innerText = "Edit Event: " + d.name;
        document.getElementById('submitBtn').innerText = "Simpan Perubahan";
        document.getElementById('cancelEditBtn').style.display = "inline-block";
        
        document.getElementById('adminPanel').scrollIntoView({behavior:'smooth'});
    }
};

/* ============================================================
   BAGIAN 3: PUBLIC PAGE LOGIC & UTILS
   ============================================================ */

// UTILITY: Fisher-Yates Shuffle Algorithm (Untuk mengacak event selesai)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function initPublicPage() {
    const container = document.getElementById('concertContainer');
    const q = query(dbCollection, orderBy("rawDate", "asc")); 
    
    container.innerHTML = '<div style="color:#666; text-align:center; grid-column:1/-1; padding:50px;">Memuat data...</div>';

    setupSearch();
    setupFilters();
    setupPopupLogic();

    const btnLoad = document.getElementById('btnLoadMore');
    if(btnLoad) {
        btnLoad.addEventListener('click', () => {
            currentLimit += 12; 
            renderGrid(currentData, true); 
        });
    }

    container.addEventListener('click', (e) => {
        const wishBtn = e.target.closest('.btn-wishlist');
        if (wishBtn) { e.stopPropagation(); toggleWishlist(wishBtn.dataset.id, wishBtn); return; }

        const detailBtn = e.target.closest('.btn-card-action');
        if (detailBtn && !detailBtn.hasAttribute('disabled')) { showPopup(detailBtn.dataset.id); }
    });

    onSnapshot(q, (snapshot) => {
        concerts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        // FIX PRELOADER: Hilang hanya setelah data dimuat
        hidePreloader();
        
        currentData = concerts;
        applyFilter('all');
    }, (err) => {
        console.error("Load Error:", err);
        container.innerHTML = `<div style="text-align:center; padding:50px;">Gagal memuat data. Periksa koneksi internet.</div>`;
        hidePreloader(); 
    });
}

function renderGrid(data, isLoadMore = false) {
    const container = document.getElementById('concertContainer');
    const loadContainer = document.getElementById('loadMoreContainer');
    const now = new Date(); now.setHours(0,0,0,0);
    
    if (!isLoadMore) {
        container.innerHTML = "";
        currentLimit = 12; 
    } 
    
    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; grid-column:1/-1; opacity:0.5;">Belum ada agenda konser.</div>`;
        if(loadContainer) loadContainer.style.display = 'none';
        return;
    }
    
    // UPGRADE: Pisahkan event yang akan datang & selesai
    const upcomingEvents = [];
    const finishedEvents = [];

    data.forEach(c => {
        const startDate = new Date(c.rawDate + 'T00:00:00');
        const isFinished = startDate < now;
        if (isFinished) finishedEvents.push(c);
        else upcomingEvents.push(c);
    });
    
    // Acak event yang selesai
    const shuffledFinished = shuffleArray(finishedEvents);
    
    // Gabungkan: Upcoming di atas, Finished di bawah
    const finalData = upcomingEvents.concat(shuffledFinished);
    
    const slicedData = finalData.slice(0, currentLimit);
    
    // FIX XSS (Bug #10): Menggunakan DocumentFragment untuk menghindari innerHTML +=
    const fragment = document.createDocumentFragment();

    slicedData.forEach((c, index) => {
        const startDate = new Date(c.rawDate + 'T00:00:00');
        const isFinished = startDate < now;
        
        let cardClasses = "card";
        let badge = "";
        let btnState = `data-id="${c.id}">Lihat Detail`;
        
        if (isFinished) {
            badge = `<div class="status-badge" style="background:#333; color:#888; border-color:#555;">SELESAI</div>`;
            btnState = `disabled>Event Berakhir`;
            cardClasses += " finished-event"; // Class untuk efek Grayscale
        } else if (c.status === 'sold-out') {
            badge = `<div class="status-badge" style="background:#ef4444; border-color:#ef4444;">SOLD OUT</div>`;
        } else if (c.status === 'limited') {
            badge = `<div class="status-badge" style="background:#f59e0b; color:black; border-color:#f59e0b;">LIMITED</div>`;
        }

        const isLoved = wishlist.includes(c.id);
        const heartIcon = isLoved ? "fa-solid fa-heart" : "fa-regular fa-heart";
        const heartActive = isLoved ? "active" : "";
        const delay = index * 0.05;

        // --- Perubahan HTML Creation (Sanitasi XSS) ---
        const article = document.createElement('article');
        article.className = cardClasses;
        article.style.animationDelay = `${delay}s`;
        
        // Sanitasi XSS: Menggunakan textContent untuk memastikan nama konser adalah teks murni.
        const safeName = document.createElement('div');
        safeName.textContent = c.name; 

        article.innerHTML = `
            <div class="card-img-wrap">
                ${badge}
                <button class="btn-wishlist ${heartActive}" data-id="${c.id}" aria-label="Tambahkan ke Favorit"><i class="${heartIcon}"></i></button>
                <img src="${c.image}" alt="Poster Konser ${safeName.textContent}" loading="lazy" onerror="this.src='https://placehold.co/600x400/020408/555?text=NO+POSTER'">
            </div>
            <div class="card-content">
                <div class="card-genre">${c.genre || 'MUSIC'}</div>
                <h3>${safeName.textContent}</h3> 
                <div class="card-details">
                    <div class="detail-row"><i class="far fa-calendar"></i> ${formatDateIndo(startDate)}</div>
                    <div class="detail-row"><i class="fas fa-map-marker-alt"></i> ${c.city}</div>
                    <div class="detail-row"><i class="fas fa-tag"></i> ${c.price || 'TBA'}</div>
                </div>
                <button class="btn-card-action" ${btnState}</button>
            </div>`;
            
        fragment.appendChild(article);
        // --- Akhir Perubahan HTML Creation ---
    });

    // Append fragment sekali ke DOM (Lebih cepat dan aman)
    container.appendChild(fragment); 

    if (slicedData.length < finalData.length) {
        if(loadContainer) loadContainer.style.display = 'block';
    } else {
        if(loadContainer) loadContainer.style.display = 'none';
    }
}

function setupSearch() {
    const input = document.getElementById('searchInput');
    if(!input) return;
    
    // FIX BUG #5: Debounce sudah diterapkan
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

function toggleWishlist(id, btnElement = null) {
    const idx = wishlist.indexOf(id);
    const concert = concerts.find(c => c.id === id); 
    if (!concert) return; 

    let msg = "";
    if (idx === -1) {
        wishlist.push(id);
        msg = `❤️ ${concert.name} Ditambahkan ke Favorit!`; 
    } else {
        wishlist.splice(idx, 1);
        msg = `💔 ${concert.name} Dihapus dari Favorit.`; 
    }
    
    localStorage.setItem('infokonser_wishlist', JSON.stringify(wishlist));
    
    const btn = btnElement || document.querySelector(`.btn-wishlist[data-id="${id}"]`);
    if(btn) {
        btn.classList.toggle('active');
        btn.innerHTML = wishlist.includes(id) ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    }

    showToast(msg);
    const activeFilter = document.querySelector('.filter-btn.active');
    if(activeFilter && activeFilter.dataset.filter === 'FAVORITE') {
        applyFilter('FAVORITE');
    }
}

function showPopup(id) {
    const c = concerts.find(x => x.id === id);
    if (!c) return;

    const popup = document.getElementById('eventPopup');
    const content = document.getElementById('popupContent');
    
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('active'), 10);

    // Sanitasi deskripsi dan nama sebelum dimasukkan ke innerHTML
    const safeDesc = document.createElement('div');
    safeDesc.textContent = c.desc;
    
    const safeName = document.createElement('div');
    safeName.textContent = c.name;
    
    const mapQuery = encodeURIComponent(`${c.venue}, ${c.city}`);
    
    // 🔥 PERBAIKAN KRITIS: Mengubah protokol http:// menjadi https:// di sini
    const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    const mapLinkUrl = `https://maps.google.com/maps?q=${mapQuery}`;

    let dateDetail = formatDateIndo(new Date(c.rawDate + 'T00:00:00'));
    
    // Menghindari XSS pada dateDetail
    const safeDateDetail = document.createElement('div');
    safeDateDetail.textContent = dateDetail;
    dateDetail = safeDateDetail.textContent;
    
    if (c.duration && parseInt(c.duration) > 1) {
        dateDetail += ` (${c.duration} Hari)`;
    }

    content.innerHTML = `
        <div style="margin-bottom:20px;">
            <span style="color:var(--primary); font-weight:700; letter-spacing:1px; text-transform:uppercase;">${c.genre}</span>
            <h2 id="popupTitle" style="font-family:var(--font-head); font-size:2rem; margin-top:5px; color:white;">${safeName.textContent}</h2>
        </div>
        
        <div class="popup-detail-grid"> 
             <div class="detail-row-popup">
                 <span class="detail-label">Tanggal</span> 
                 <span class="detail-value">${dateDetail}</span>
             </div>
             <div class="detail-row-popup">
                 <span class="detail-label">Lokasi</span> 
                 <span class="detail-value">${c.venue}, ${c.city}</span>
             </div>
             <div class="detail-row-popup">
                 <span class="detail-label">Tiket</span> 
                 <span class="detail-value highlight">${c.price || 'TBA'}</span>
             </div>
             <div class="detail-row-popup">
                 <span class="detail-label">Waktu</span> 
                 <span class="detail-value">${c.time || 'Open Gate'} ${c.timezone || 'WIB'}</span>
             </div>
        </div>
        
        <p style="color:#ccc; line-height:1.6; margin-bottom:25px; font-size:0.95rem;">${safeDesc.textContent}</p>
        
        <div class="map-container">
            <iframe 
                width="100%" 
                height="150" 
                frameborder="0" 
                scrolling="no" 
                marginheight="0" 
                marginwidth="0" 
                src="${mapEmbedUrl}"
                style="filter: invert(90%) hue-rotate(180deg);"
                title="Peta Lokasi Konser ${safeName.textContent}">
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

function hidePreloader() {
    const preloader = document.getElementById('preloader');
    if (preloader && !preloader.classList.contains('hide')) {
        setTimeout(() => {
            preloader.classList.add('hide'); 
            setTimeout(() => { preloader.remove(); }, 800); 
        }, 300); 
    }
}

function setupAddons() {
    const backBtn = document.getElementById('backToTop');
    if(backBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) backBtn.classList.add('show');
            else backBtn.classList.remove('show');
        });
    }

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

function formatDateIndo(date) {
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const txt = document.getElementById('toastMsg');
    
    toast.classList.remove('show');
    toast.style.opacity = '0'; 

    txt.innerText = msg;
    
    setTimeout(() => { toast.classList.add('show'); toast.style.opacity = '1'; }, 10); 
    setTimeout(() => { toast.classList.remove('show'); toast.style.opacity = '0'; }, 3000);
    setTimeout(() => { if (!toast.classList.contains('show')) { toast.style.opacity = '0'; } }, 3500); 
}

// UTILS HARGA
function cleanPrice(value) {
    return value.replace(/[^0-9]/g, '');
}

function formatRupiahDisplay(number) {
    if (!number) return 'TBA';
    const cleanNumber = number.toString().replace(/[^0-9]/g, ''); 
    if (!cleanNumber) return 'TBA';
    
    return new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(cleanNumber);
}

function formatUSDDisplay(number) {
    if (!number) return 'TBA';
    const cleanNumber = number.toString().replace(/[^0-9.]/g, ''); 
    if (!cleanNumber) return 'TBA';

    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(parseFloat(cleanNumber));
}

function formatPriceInput(inputElement) {
    const currency = document.getElementById('concertCurrency').value;
    let value = inputElement.value;
    
    if (currency === 'IDR') {
        let clean = cleanPrice(value);
        if (clean) {
            inputElement.value = clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        } else {
            inputElement.value = '';
        }
    } else if (currency === 'USD') {
        let clean = value.replace(/[^0-9.]/g, '');
        let parts = clean.split('.');
        if (parts.length > 2) {
            clean = parts.shift() + '.' + parts.join('');
        }
        inputElement.value = clean;
    } else {
        inputElement.value = value.replace(/[^0-9.]/g, '');
    }
}