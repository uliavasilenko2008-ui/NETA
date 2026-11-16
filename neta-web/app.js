const CLASSES = ['can', 'glass', 'paper', 'plastic', 'trash'];
const NAMES = {
    can: 'Банка (металл)', glass: 'Стекло', paper: 'Бумага',
    plastic: 'Пластик', trash: 'Обычный мусор',
};
const GRAMS = { can: 15, glass: 350, paper: 5, plastic: 30, trash: 0 };
const SIZE = 640;
const MIN_CONF = 0.15;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

//Модель
ort.env.wasm.numThreads = 1;
const session = ort.InferenceSession.create('best.onnx', { executionProviders: ['wasm'] });
session.catch(e => { $('status').textContent = 'Модель не загрузилась: ' + e.message; });

// Фото -> квадрат 640x640 с серыми полями -> тензор [1, 3, 640, 640]
function toTensor(img) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const k = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);

    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const area = SIZE * SIZE;
    const data = new Float32Array(3 * area);
    for (let i = 0; i < area; i++) {
        data[i] = px[i * 4] / 255;
        data[area + i] = px[i * 4 + 1] / 255;
        data[2 * area + i] = px[i * 4 + 2] / 255;
    }
    return new ort.Tensor('float32', data, [1, 3, SIZE, SIZE]);
}

async function detect(img) {
    const s = await session;
    const out = await s.run({ [s.inputNames[0]]: toTensor(img) });
    const o = out[s.outputNames[0]];
    const candidates = o.dims[2];

    return CLASSES
        .map((name, c) => {
            let conf = 0;
            for (let a = 0; a < candidates; a++) {
                conf = Math.max(conf, o.data[(4 + c) * candidates + a]);
            }
            return { name, conf };
        })
        .filter(x => x.conf >= MIN_CONF)
        .sort((a, b) => b.conf - a.conf)
        .slice(0, 3);
}

//Интерфейс
$('file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    const img = $('preview');
    img.src = URL.createObjectURL(file);
    img.hidden = false;
    $('results').innerHTML = '';
    $('status').textContent = 'Смотрим, что на фото...';

    let found = [];
    try {
        await img.decode();
        found = (await detect(img)).map(x => x.name);
        $('status').textContent = found.length
            ? 'Мы нашли на фото: ' + found.map(n => NAMES[n]).join(', ')
            : 'Не поняли, что на фото. Выберите материал сами.';
    } catch (err) {
        console.error(err);
        $('status').textContent = 'Не удалось распознать. Выберите материал сами.';
    }
    renderForm(found);
});

function renderForm(found) {
    $('form').hidden = false;
    $('materials').innerHTML = Object.keys(NAMES).map(key => `
        <label class="chip">
            <input type="checkbox" value="${key}" ${found.includes(key) ? 'checked' : ''}>
            ${NAMES[key]}
            ${key === 'trash' ? '' :
        `<input type="number" id="qty_${key}" min="1" max="500" value="1"> <small>шт.</small>`}
        </label>`).join('');
}

function renderCard(p) {
    return `
        <div class="card">
            <b>${esc(p.name)}</b>${p.distance_km != null ? ' · ' + esc(p.distance_km) + ' км' : ''}<br>
            ${p.address ? esc(p.address) + '<br>' : ''}
            ${p.phone ? '📞 ' + esc(p.phone) + '<br>' : ''}
            <span class="hint">Цену и приём материала уточняйте по телефону</span>
        </div>`;
}

async function renderMaterial(material, city) {
    let html = `<h3>${NAMES[material]}</h3>`;
    if (material === 'trash') {
        return html + '<p>Обычный мусор в переработку не принимается.</p>';
    }

    const qty = Number($('qty_' + material).value) || 1;
    html += `<p class="hint">Примерно ${(qty * GRAMS[material] / 1000).toFixed(2)} килограмма</p>`;

    let points = [];
    try {
        points = await getPoints(city, material);
    } catch (err) {
        console.error(err);
    }
    if (!points.length) return html + '<p class="hint">Пунктов пока нет в базе.</p>';
    return html + points.slice(0, 3).map(renderCard).join('');
}

$('go').addEventListener('click', async () => {
    const city = $('city').value.trim() || 'Караганда';
    const chosen = [...document.querySelectorAll('#materials input[type=checkbox]:checked')]
        .map(c => c.value);

    if (!chosen.length) {
        $('results').innerHTML = '<p>Выберите хотя бы один материал.</p>';
        return;
    }
    $('results').innerHTML = '<p class="hint">Ищем пункты приёма...</p>';
    const blocks = await Promise.all(chosen.map(m => renderMaterial(m, city)));
    $('results').innerHTML = blocks.join('');
});