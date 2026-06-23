// Set real-time clock
document.getElementById('current-time-hero').textContent = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';

let trendChartObj = null;
let mainMap = null; // Dipertahankan sebagai penampung objek peta global

const DEFAULT_LOGS = [
    { waktu: "2026-06-23 11:30:15", wilayah: "Jakarta Pusat", suhu: 32, kelembapan: 70, pm25: 148.5, status: "Sedang" },
    { waktu: "2026-06-23 10:15:22", wilayah: "Tangerang Selatan", suhu: 34, kelembapan: 85, pm25: 162.1, status: "TIDAK SEHAT" },
    { waktu: "2026-06-23 09:00:10", wilayah: "Yogyakarta", suhu: 26, kelembapan: 65, pm25: 32.4, status: "BAIK" }
];

window.onload = function() {
    if (!localStorage.getItem('aeropredict_logs')) {
        localStorage.setItem('aeropredict_logs', JSON.stringify(DEFAULT_LOGS));
    }
    renderLogTable();
    initMockChart();
    initLeafletMap();
    
    // AUTOMATIC LOCATION DETECTION ON LOAD
    detectUserLocation(false); 
}

// 1. UPDATE LABELS SLIDERS
function updateSliders() {
    const suhu = document.getElementById('input-suhu').value;
    const kelembapan = document.getElementById('input-kelembapan').value;
    const angin = document.getElementById('input-angin').value;

    document.getElementById('label-suhu').textContent = `${suhu} °C`;
    document.getElementById('label-kelembapan').textContent = `${kelembapan} %`;
    document.getElementById('label-angin').textContent = `${angin} km/jam`;
}

// 2. DETEKSI LOKASI OTOMATIS (GPS Engine)
async function detectUserLocation(manualClick = false) {
    if (manualClick) {
        showToast("Mencari titik satelit lokasi HP/Laptop Anda...", "info");
    }

    if (!navigator.geolocation) {
        fallbackToDefault("Sistem lokasi GPS tidak didukung browser ini.");
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        try {
            // PERBAIKAN SINTAKS TEMPLATE LITERAL: Menghilangkan tanda petik/karakter asing di ujung ${lon}
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            
            // PERBAIKAN DATA FALLBACK: Mengantisipasi properti alamat kosong
            const addr = data.address || {};
            const city = addr.city || addr.town || addr.village || addr.municipality || addr.regency || addr.state || "Lokasi Terdeteksi";
            
            document.getElementById('input-wilayah').value = city;
            
            // PERBAIKAN INTEGRASI PETA: Memperbarui penanda koordinat di peta global secara langsung
            if (mainMap !== null) {
                mainMap.setView([lat, lon], 13);
                L.marker([lat, lon]).addTo(mainMap)
                    .bindPopup(`<b>Lokasi Anda:</b><br>${city}`)
                    .openPopup();
                
                setTimeout(() => { mainMap.invalidateSize(); }, 400);
            }

            calculateAIPrediction();

        } catch (error) {
            document.getElementById('input-wilayah').value = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
            calculateAIPrediction();
        }
    }, (error) => {
        fallbackToDefault(manualClick ? "Izin lokasi ditolak atau GPS tidak aktif." : null);
    }, { enableHighAccuracy: true, timeout: 6000 });
}

function fallbackToDefault(reason = null) {
    document.getElementById('input-wilayah').value = "Jakarta Pusat (Default)";
    document.getElementById('input-suhu').value = 31;
    document.getElementById('input-kelembapan').value = 75;
    document.getElementById('input-angin').value = 10;
    updateSliders();
    calculateAIPrediction();
    if (reason) {
        showToast(`${reason} Beralih ke default Jakarta Pusat.`, "warning");
    }
}

// 3. AI PREDICTION CALCULATION ENGINE
function calculateAIPrediction() {
    const wilayah = document.getElementById('input-wilayah').value || "Lokasi Anda";
    const suhu = parseFloat(document.getElementById('input-suhu').value);
    const kelembapan = parseFloat(document.getElementById('input-kelembapan').value);
    const angin = parseFloat(document.getElementById('input-angin').value);

    let rawPM25 = (suhu * 2.9) + (kelembapan * 0.98) - (angin * 1.9);
    rawPM25 += 10 + (Math.sin(suhu) * 7);

    if (rawPM25 < 10) rawPM25 = 15.2;
    if (rawPM25 > 250) rawPM25 = 241.3;

    const finalPM25 = parseFloat(rawPM25.toFixed(1));

    let status = "";
    let statusTitle = "";
    let statusDesc = "";
    let actionText = "";
    let actionIcon = "fa-heart-pulse";
    let colorClasses = {};

    if (finalPM25 <= 50) {
        status = "BAIK (Aman)";
        statusTitle = "Kondisi Udara Sangat Sehat! 🍃";
        statusDesc = "Kualitas udara di koordinat Anda sangat jernih dan bebas dari polutan berbahaya. Sangat aman bagi aktivitas luar ruangan semua usia.";
        actionText = "Hari yang sempurna untuk joging atau bersepeda tanpa masker!";
        actionIcon = "fa-person-running";
        colorClasses = {
            bg: "bg-emerald-50/80",
            border: "border-emerald-200",
            badgeBg: "bg-emerald-100",
            badgeText: "text-emerald-800",
            badgeBullet: "bg-emerald-600"
        };
    } else if (finalPM25 <= 150) {
        status = "Sedang (Waspada)";
        statusTitle = "Kualitas Udara Sedang / Moderat ⚠️";
        statusDesc = "Konsentrasi partikel PM2.5 berada pada tingkat ambang batas wajar. Kelompok sensitif (penderita asma) direkomendasikan berhati-hai.";
        actionText = "Kelompok rentan direkomendasikan membawa masker cadangan.";
        actionIcon = "fa-mask-face";
        colorClasses = {
            bg: "bg-amber-50/80",
            border: "border-amber-200",
            badgeBg: "bg-amber-100",
            badgeText: "text-amber-800",
            badgeBullet: "bg-amber-600"
        };
    } else {
        status = "TIDAK SEHAT (Bahaya)";
        statusTitle = "Bahaya! Udara Tidak Sehat 🚨";
        statusDesc = "Tingkat polusi sangat tinggi. Partikel PM2.5 dapat menumpuk di saluran pernapasan. Sangat direkomendasikan membatasi aktivitas fisik di luar.";
        actionText = "Gunakan masker KN95/Medis, tutup ventilasi rumah, hidupkan purifier.";
        actionIcon = "fa-triangle-exclamation";
        colorClasses = {
            bg: "bg-rose-50/80",
            border: "border-rose-200",
            badgeBg: "bg-rose-100",
            badgeText: "text-rose-800",
            badgeBullet: "bg-rose-600"
        };
    }

    const resultCard = document.getElementById('ai-result-card');
    resultCard.className = `rounded-2xl shadow-lg border p-6 md:p-8 relative overflow-hidden transition-all duration-300 ${colorClasses.bg} ${colorClasses.border}`;

    document.getElementById('pm25-score').textContent = finalPM25;
    
    const badge = document.getElementById('aqi-badge');
    badge.className = `mt-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition ${colorClasses.badgeBg} ${colorClasses.badgeText}`;
    badge.querySelector('span').className = `w-2 h-2 rounded-full ${colorClasses.badgeBullet}`;
    badge.querySelector('span').nextElementSibling.textContent = status.toUpperCase();

    document.getElementById('status-title').textContent = statusTitle;
    document.getElementById('status-desc').textContent = statusDesc;
    document.getElementById('recommendation-text').textContent = actionText;
    document.getElementById('recommendation-icon').className = `fa-solid ${actionIcon} text-eco-500 text-sm`;

    saveLogToDatabase(wilayah, suhu, kelembapan, finalPM25, status);
    updateTrendChart(finalPM25);
}

// 4. DATABASE SIMULATION
function saveLogToDatabase(wilayah, suhu, kelembapan, pm25, status) {
    const currentLogs = JSON.parse(localStorage.getItem('aeropredict_logs')) || [];
    const newLog = {
        waktu: new Date().toISOString().replace('T', ' ').substring(0, 19),
        wilayah: wilayah,
        suhu: suhu,
        kelembapan: kelembapan,
        pm25: pm25,
        status: status
    };
    currentLogs.unshift(newLog);
    if (currentLogs.length > 10) currentLogs.pop();
    localStorage.setItem('aeropredict_logs', JSON.stringify(currentLogs));
    renderLogTable();
}

function renderLogTable() {
    const logs = JSON.parse(localStorage.getItem('aeropredict_logs')) || [];
    const tbody = document.getElementById('database-rows');
    tbody.innerHTML = '';

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400">Database kosong.</td></tr>`;
        return;
    }

    logs.forEach(log => {
        let badgeColor = "bg-emerald-50 text-emerald-700";
        if (log.status.includes("Sedang") || log.status.includes("Waspada")) badgeColor = "bg-amber-50 text-amber-700";
        if (log.status.includes("TIDAK") || log.status.includes("Bahaya")) badgeColor = "bg-rose-50 text-rose-700";

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="p-3 font-mono text-[9px] text-slate-400">${log.waktu}</td>
            <td class="p-3 font-bold text-slate-700">${log.wilayah}</td>
            <td class="p-3">${log.suhu}°C / ${log.kelembapan}%</td>
            <td class="p-3 text-center font-extrabold text-slate-900">${log.pm25} µg/m³</td>
            <td class="p-3 text-center">
                <span class="inline-block px-2 py-0.5 rounded-full font-bold text-[8px] ${badgeColor}">
                    ${log.status.split(" ")[0]}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function clearHistoryLog() {
    localStorage.setItem('aeropredict_logs', JSON.stringify([]));
    renderLogTable();
    showToast("Database log riwayat pencarian dikosongkan.", "info");
}

// 5. CHART ENGINE
function initMockChart() {
    const ctx = document.getElementById('trendChart').getContext('2d');
    const hours = ["12 Jam Lalu", "10 Jam Lalu", "8 Jam Lalu", "6 Jam Lalu", "4 Jam Lalu", "2 Jam Lalu", "Saat Ini"];
    const initialData = [45, 62, 85, 110, 75, 52, 58];

    trendChartObj = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                data: initialData,
                borderColor: '#10b981',
                borderWidth: 2.5,
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#10b981',
                pointBorderWidth: 1.5,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function updateTrendChart(latestValue) {
    if (!trendChartObj) return;
    const dataset = trendChartObj.data.datasets[0].data;
    dataset.shift();
    dataset.push(latestValue);

    if (latestValue <= 50) {
        trendChartObj.data.datasets[0].borderColor = '#10b981';
        trendChartObj.data.datasets[0].pointBorderColor = '#10b981';
    } else if (latestValue <= 150) {
        trendChartObj.data.datasets[0].borderColor = '#f59e0b';
        trendChartObj.data.datasets[0].pointBorderColor = '#f59e0b';
    } else {
        trendChartObj.data.datasets[0].borderColor = '#ef4444';
        trendChartObj.data.datasets[0].pointBorderColor = '#ef4444';
    }
    trendChartObj.update();
}

// 6. LEAFLET MAP ENGINE
function initLeafletMap() {
    mainMap = L.map('map', { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: !L.Browser.mobile }).setView([-2.5, 118], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(mainMap);

    const cities = [
        { name: "Jakarta Pusat", coords: [-6.18, 106.83], temp: 31, humidity: 78, wind: 10, pm25: 151.0, color: "red" },
        { name: "Tangerang Selatan", coords: [-6.28, 106.71], temp: 33, humidity: 82, wind: 5, pm25: 158.2, color: "red" },
        { name: "Bandung", coords: [-6.91, 107.61], temp: 24, humidity: 68, wind: 15, pm25: 94.5, color: "orange" },
        { name: "Surabaya", coords: [-7.25, 112.75], temp: 32, humidity: 80, wind: 20, pm25: 78.1, color: "orange" },
        { name: "Yogyakarta", coords: [-7.79, 110.37], temp: 26, humidity: 65, wind: 12, pm25: 34.2, color: "green" },
        { name: "Medan", coords: [3.59, 98.67], temp: 30, humidity: 85, wind: 8, pm25: 112.5, color: "orange" }
    ];

    cities.forEach(city => {
        let markerColor = "#10b981";
        if (city.color === "orange") markerColor = "#f59e0b";
        if (city.color === "red") markerColor = "#ef4444";

        const circle = L.circleMarker(city.coords, {
            color: markerColor,
            fillColor: markerColor,
            fillOpacity: 0.6,
            radius: 10
        }).addTo(mainMap);

        circle.bindPopup(`
            <div class="font-sans text-[11px] p-0.5">
                <h4 class="font-bold text-slate-800 text-xs mb-0.5">${city.name}</h4>
                <p class="mb-2">Prediksi: <b>${city.pm25} µg/m³</b></p>
                <button onclick="loadCityToPredictor('${city.name}', ${city.temp}, ${city.humidity}, ${city.wind})" class="bg-slate-900 text-white font-bold py-1 px-2 rounded text-[9px] w-full text-center block">
                    Muat di Prediktor
                </button>
            </div>
        `);
    });
}

function loadCityToPredictor(name, temp, humidity, wind) {
    document.getElementById('input-wilayah').value = name;
    document.getElementById('input-suhu').value = temp;
    document.getElementById('input-kelembapan').value = humidity;
    document.getElementById('input-angin').value = wind;
    updateSliders();
    calculateAIPrediction();
    showToast(`Data wilayah ${name} dimuat!`, "success");
    document.getElementById('analisis').scrollIntoView({ behavior: 'smooth' });
}

// 7. TOAST MESSAGES
function showToast(message, type = "success") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let bgColors = "bg-emerald-500 text-white";
    let icon = "fa-circle-check";

    if (type === "warning") {
        bgColors = "bg-amber-500 text-white";
        icon = "fa-triangle-exclamation";
    } else if (type === "danger") {
        bgColors = "bg-rose-500 text-white";
        icon = "fa-circle-xmark";
    } else if (type === "info") {
        bgColors = "bg-slate-800 text-white";
        icon = "fa-circle-info";
    }

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transition-all duration-300 transform translate-y-2 opacity-0 text-xs font-semibold ${bgColors}`;
    toast.innerHTML = `
        <i class="fa-solid ${icon} text-sm"></i>
        <span class="flex-1 text-[11px]">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-white hover:opacity-80 transition"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// 8. SUBSCRIPTION ALERT SYSTEM
function subscribeAlert(e) {
    e.preventDefault();
    const nama = document.getElementById('alert-nama').value;
    const email = document.getElementById('alert-email').value;
    const wa = document.getElementById('alert-wa').value;

    const modalBackdrop = document.getElementById('modal-backdrop');
    const successModal = document.getElementById('success-modal');
    const msgSpan = document.getElementById('modal-success-message');

    msgSpan.innerHTML = `Terima kasih <b>${nama}</b>! Layanan pengiriman notifikasi instan berbasis AI aktif untuk email <b>${email}</b> dan WhatsApp <b>${wa}</b>.`;

    modalBackdrop.classList.remove('hidden');
    setTimeout(() => {
        modalBackdrop.classList.remove('opacity-0');
        successModal.classList.remove('scale-95');
    }, 50);

    document.getElementById('alert-nama').value = "";
    document.getElementById('alert-email').value = "";
    document.getElementById('alert-wa').value = "";
}

function closeSuccessModal() {
    const modalBackdrop = document.getElementById('modal-backdrop');
    const successModal = document.getElementById('success-modal');

    modalBackdrop.classList.add('opacity-0');
    successModal.classList.add('scale-95');
    setTimeout(() => {
        modalBackdrop.classList.add('hidden');
    }, 300);
}