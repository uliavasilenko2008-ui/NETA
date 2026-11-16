const API_URL = ''; // <- Сюда вставляй адрес своего API

// Ожидаемый запрос:  GET {API_URL}?city=Караганда&material=can
// material принимает: can | glass | paper | plastic
// Ожидаемый ответ (JSON): либо массив, либо { "points": [ ... ] }
// Каждый пункт: { name, address, phone, distance_km }

function normalize(p) {
    return {
        name: p.name,
        address: p.address ?? '',
        phone: p.phone ?? '',
        distance_km: p.distance_km ?? null,
    };
}

async function getPoints(city, material) {
    if (!API_URL) return [];   // API ещё не подключён

    const url = `${API_URL}?city=${encodeURIComponent(city)}&material=${material}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('API ответил ' + response.status);

    const data = await response.json();
    const list = Array.isArray(data) ? data : (data.points ?? []);
    return list.map(normalize);
}