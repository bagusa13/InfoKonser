/* ============================================================
   INFOKONSER.ID - ENGINE V3 (FINAL STABLE VERSION)
   FIXED ISSUES: 
   1. Admin Upload: Menggunakan logika Reset Form di awal (Anti-Gagal)
   2. Maps URL: HTTPS & Template String Benar
   3. Cloudinary: Typo Fixed & Alert Sukses Ditambahkan
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
        currentData = concerts;
        applyFilter('all');
    }, (err) => {
        console.error("Load Error:", err);
        container.innerHTML = `<div style="text-align:center; padding:50px;">Gagal memuat data. Periksa koneksi internet.</div>`;
    });
}

function renderGrid(data, isLoadMore = false) {
    const container = document.getElementById('concertContainer');
    const loadContainer = document.getElementById('loadMoreContainer');
    
    if (!isLoadMore) {
        container.innerHTML = "";
        currentLimit = 12; 
    } 
    
    if (data.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; grid-column:1/-1; opacity:0.5;">Belum ada agenda konser.</div>`;
        if(loadContainer) loadContainer.style.display = 'none';
        return;
    }

    const slicedData = data.slice(0, currentLimit);
    const now = new Date(); now.setHours(0,0,0,0);

    slicedData.forEach((c, index) => {
        const startDate = new Date(c.rawDate + 'T00:00:00');
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
        const delay = index * 0.05;

        const html = `
        <article class="card" style="animation-delay: ${delay}s">
            <div class="card-img-wrap">
                ${badge}
                <button class="btn-wishlist ${heartActive}" data-id="${c.id}" aria-label="Tambahkan ke Favorit"><i class="${heartIcon}"></i></button>
                <img src="${c.image}" alt="Poster Konser ${c.name}" loading="lazy" onerror="this.src='https://placehold.co/600x400/020408/555?text=NO+POSTER'">
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

    if (slicedData.length < data.length) {
        if(loadContainer) loadContainer.style.display = 'block';
    } else {
        if(loadContainer) loadContainer.style.display = 'none';
    }
}

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

    const mapQuery = encodeURIComponent(`${c.venue}, ${c.city}`);
    
    // PERBAIKAN MAPS: Menggunakan HTTPS dan Template Literal yang benar
    const mapEmbedUrl = `https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    const mapLinkUrl = `https://maps.google.com/maps?q=${mapQuery}`;

    let dateDetail = formatDateIndo(new Date(c.rawDate + 'T00:00:00'));
    
    if (c.duration && parseInt(c.duration) > 1) {
        dateDetail += ` (${c.duration} Hari)`;
    }

    content.innerHTML = `
        <div style="margin-bottom:20px;">
            <span style="color:var(--primary); font-weight:700; letter-spacing:1px; text-transform:uppercase;">${c.genre}</span>
            <h2 id="popupTitle" style="font-family:var(--font-head); font-size:2rem; margin-top:5px; color:white;">${c.name}</h2>
        </div>
        
        <div style="display:grid; gap:15px; margin-bottom:25px; border-top:1px solid var(--border); padding-top:20px;">
             <div class="detail-row"><span style="width:80px;">Tanggal</span> <span style="color:white;">${dateDetail}</span></div>
             <div class="detail-row"><span style="width:80px;">Lokasi</span> <span style="color:white;">${c.venue}, ${c.city}</span></div>
             <div class="detail-row"><span style="width:80px;">Tiket</span> <span style="color:var(--primary); font-weight:600;">${c.price || 'TBA'}</span></div>
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
                style="filter: invert(90%) hue-rotate(180deg);"
                title="Peta Lokasi Konser ${c.name}">
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

function setupAddons() {
    window.addEventListener('load', () => {
        const preloader = document.getElementById('preloader');
        if(preloader) {
            setTimeout(() => {
                preloader.classList.add('hide'); 
                setTimeout(() => { preloader.remove(); }, 800); 
            }, 300); 
        }
    });

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

// --- FIX UTAMA: RESET FORM TERLEBIH DAHULU ---
function setupAdminForm() {
    const priceInput = document.getElementById('concertPrice');
    const currencyInput = document.getElementById('concertCurrency');

    if(priceInput) {
        priceInput.addEventListener('input', function() { formatPriceInput(this); });
        currencyInput.addEventListener('change', function() { formatPriceInput(priceInput); });
    }

    const form = document.getElementById('concertForm');
    if(form) {
        // 1. RESET FORM LAMA (PENTING: Agar listener lama hilang)
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);

        // 2. AMBIL ULANG ELEMEN (Dari form yang baru dibuat)
        const imgInput = document.getElementById('imageInput'); 

        // 3. PASANG LISTENER UPLOAD (Ke elemen baru)
        if(imgInput) {
            imgInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if(!file) return;
                
                const CLOUDINARY_CLOUD_NAME = 'dyfc0i8y5'; // Pastikan 'i'
                const CLOUDINARY_UPLOAD_PRESET = 'InfoKonser'; 
                const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
                
                document.getElementById('uploadStatus').innerText = "⏳Sedang Mengupload ke Cloudinary...";
                
                const formData = new FormData();
                formData.append("file", file); 
                formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET); 
                
                try {
                    const req = await fetch(CLOUDINARY_URL, { method:'POST', body:formData });
                    const res = await req.json();
                    
                    if(res.secure_url) {
                        const link = res.secure_url;
                        document.getElementById('concertImage').value = link;
                        
                        document.getElementById('imagePreview').innerHTML = `<img src="${link}" alt="Poster Preview" style="width:100%; border-radius:10px;">`;
                        document.getElementById('uploadStatus').innerText = "✅ Upload Berhasil! Silakan Simpan.";
                        
                        // ALERT TAMBAHAN AGAR USER YAKIN
                        alert("SUKSES: Gambar Poster Berhasil Diupload!");
                        
                    } else { 
                        document.getElementById('uploadStatus').innerText = "❌ Gagal Upload: " + (res.error?.message || "Unknown Error"); 
                    }
                } catch(err) { 
                    document.getElementById('uploadStatus').innerText = "❌ Gagal Upload (Cek koneksi/preset)"; 
                    console.error("Cloudinary Upload Error:", err);
                }
            });
        }

        // 4. PASANG LISTENER SUBMIT (Ke form baru)
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('editId').value;
            const img = document.getElementById('concertImage').value || document.getElementById('oldImage').value;
            
            // Validasi: Wajib ada gambar jika mode Tambah Baru
            if(!img && !editId) { 
                alert("Wajib upload poster! Tunggu sampai muncul pesan sukses."); 
                return; 
            }
            
            const currency = document.getElementById('concertCurrency').value;
            const rawPriceInput = document.getElementById('concertPrice').value;
            const rawPrice = (currency === 'IDR') ? cleanPrice(rawPriceInput) : rawPriceInput;

            let formattedPrice = 'TBA';
            if (currency === 'IDR') {
                formattedPrice = formatRupiahDisplay(rawPrice);
            } else if (currency === 'USD') {
                formattedPrice = formatUSDDisplay(rawPrice);
            }

            const data = {
                name: document.getElementById('bandName').value,
                city: document.getElementById('concertCity').value.toUpperCase(),
                venue: document.getElementById('concertVenue').value,
                genre: document.getElementById('concertGenre').value,
                rawDate: document.getElementById('concertDateOnly').value, 
                time: document.getElementById('concertTimeOnly').value,
                timezone: document.getElementById('concertTimezone').value,
                duration: document.getElementById('concertDuration').value, 
                price: formattedPrice, 
                rawPrice: rawPrice, 
                currency: currency, 
                status: document.getElementById('concertStatus').value,
                desc: document.getElementById('concertDetail').value,
                image: img
            };

            const btn = document.getElementById('submitBtn');
            const originalText = btn.innerText;
            btn.innerText = "Menyimpan...";
            btn.disabled = true;

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
            } catch(err) { 
                alert("Error: " + err.message); 
                btn.innerText = originalText;
                btn.disabled = false;
            }
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
        document.getElementById('concertCurrency').value = d.currency || 'IDR';
        
        document.getElementById('concertPrice').value = d.rawPrice || ''; 
        formatPriceInput(document.getElementById('concertPrice'));
        
        document.getElementById('concertStatus').value = d.status;
        document.getElementById('concertDetail').value = d.desc;
        document.getElementById('concertDuration').value = d.duration || '1';
        
        document.getElementById('imagePreview').innerHTML = `<img src="${d.image}" alt="Poster Preview Edit" style="width:100%;">`;
        document.getElementById('formTitle').innerText = "Edit Event: " + d.name;
        document.getElementById('submitBtn').innerText = "Simpan Perubahan";
        document.getElementById('cancelEditBtn').style.display = "inline-block";
        
        document.getElementById('adminPanel').scrollIntoView({behavior:'smooth'});
    }
};