// --- Variáveis Globais e Inicialização ---
let map;
let csvData = [];
let markerClusterGroup;
let polylineFeatureGroup;

// Variáveis para manter o estado atual da escala de cores para o cluster icon
let currentMinValue = Infinity;
let currentMaxValue = -Infinity;
let currentSelectedColumn = '';
let currentHasNumericalSelectedData = false;

// Variável global para a instância do Chart.js
let dataChartInstance = null;

// Array de marcadores indexados pela linha do CSV (para sincronização gráfico → mapa)
let markersIndex = [];

// Marcador de destaque temporário
let highlightMarker = null;

// Referências aos elementos do DOM para interatividade e legenda
const csvFileInput = document.getElementById('csvFile');
const mapDataColumnSelect = document.getElementById('mapDataColumn');
const columnSelectorDiv = document.getElementById('columnSelector');
const colorLegendDiv = document.getElementById('colorLegend');
const gradientBar = document.getElementById('gradientBar');
const minValLabel = document.getElementById('minValLabel');
const maxValLabel = document.getElementById('maxValLabel');
// Referências para o canvas e mensagem do gráfico
const dataChartCanvas = document.getElementById('dataChart');
const chartMessage = document.getElementById('chartMessage');

// Inicializa o mapa ao carregar a página
document.addEventListener('DOMContentLoaded', initMap);

// Função de inicialização do mapa (sem alterações significativas aqui)
function initMap() {
    if (map) {
        map.remove();
    }
    map = L.map('map').setView([-14.235, -51.9253], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
}

// --- Funções de Leitura e Processamento de Dados ---
// ... (parseCSVFile, populateDataColumnSelector, csvFileInput.addEventListener, dataColumnSelect.addEventListener - permanecem iguais) ...
csvFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
        console.warn('Nenhum arquivo selecionado.');
        return;
    }

    try {
        const results = await parseCSVFile(file);
        csvData = results.data;
        console.log('Dados CSV carregados e processados:', csvData);
        populateDataColumnSelector(results.meta.fields);
        columnSelectorDiv.style.display = 'flex';
        plotDataOnMap();
    } catch (error) {
        console.error('Erro ao processar o arquivo CSV:', error);
        alert('Erro ao ler o arquivo CSV. Verifique o formato e o console para mais detalhes.');
    }
});

function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => resolve(results),
            error: (error) => reject(error)
        });
    });
}

function populateDataColumnSelector(headers) {
    mapDataColumnSelect.innerHTML = '';
    const commonCoordNames = ['latitude', 'longitude', 'lat', 'lon', 'x', 'y'];

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '--- Selecionar Dado para Cor ---';
    mapDataColumnSelect.appendChild(defaultOption);

    headers.forEach(header => {
        if (!commonCoordNames.includes(header.toLowerCase()) && header) {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            mapDataColumnSelect.appendChild(option);
        }
    });
}

mapDataColumnSelect.addEventListener('change', plotDataOnMap);

// --- Funções de Visualização no Mapa (sem alterações nas funções auxiliares) ---

function getColorForValue(value, min, max) {
    if (min === max) {
        return 'hsl(120, 100%, 50%)';
    }
    const normalized = (value - min) / (max - min);
    const hue = 240 - (normalized * 240);
    return `hsl(${hue}, 100%, 50%)`;
}

function updateColorLegend(minVal, maxVal, isConverted = false) {
    if (minVal === Infinity || maxVal === -Infinity || !currentHasNumericalSelectedData) {
        colorLegendDiv.style.display = 'none';
        return;
    }
    colorLegendDiv.style.display = 'block';
    
    const unit = isConverted ? '°C' : '';
    const title = isConverted ? 'Legenda da Cor (ºC)' : 'Legenda da Cor';
    document.querySelector('#colorLegend h4').textContent = title;
    minValLabel.textContent = `Min: ${minVal.toFixed(2)}${unit}`;
    maxValLabel.textContent = `Max: ${maxVal.toFixed(2)}${unit}`;

    const gradientCss = `linear-gradient(to right, ${getColorForValue(minVal, minVal, maxVal)}, ${getColorForValue(maxVal, minVal, maxVal)})`;
    gradientBar.style.background = gradientCss;
}

// --- Funções para o Gráfico de Linhas ---

/**
 * Atualiza ou cria o gráfico de linhas com os dados do CSV.
 */
function updateDataChart() {
    if (dataChartInstance) {
        dataChartInstance.destroy();
        dataChartInstance = null;
    }

    if (csvData.length === 0) {
        chartMessage.textContent = 'Carregue um arquivo CSV para visualizar o gráfico de dados.';
        chartMessage.style.display = 'block';
        dataChartCanvas.style.display = 'none';
        return;
    }

    const headers = Object.keys(csvData[0]);
    const commonCoordNames = ['latitude', 'longitude', 'lat', 'lon', 'x', 'y'];
    const timeKeys = ['timestamp', 'date', 'time', 'datetime'];

    // Tenta encontrar uma coluna de tempo para o eixo X
    let timeColumn = headers.find(h => timeKeys.includes(h.toLowerCase()));
    const labels = csvData.map((row, index) => {
        if (timeColumn) {
            // Tenta usar Luxon para formatar datas, se possível
            const dt = luxon.DateTime.fromISO(row[timeColumn]) || luxon.DateTime.fromRFC2822(row[timeColumn]);
            if (dt.isValid) {
                return dt.toLocaleString(luxon.DateTime.DATETIME_SHORT);
            }
            return row[timeColumn]; // Fallback para o valor original
        }
        return `Ponto ${index + 1}`;
    });

    const datasets = headers
        .filter(header => {
            // Filtra para incluir apenas colunas numéricas que não são coordenadas
            const isCoord = commonCoordNames.includes(header.toLowerCase());
            const hasNumericData = csvData.some(row => typeof row[header] === 'number');
            return header && !isCoord && hasNumericData;
        })
        .map((header, index) => {
            const needsConversion = header.includes('°F');
            const data = csvData.map(row => {
                const value = row[header];
                if (needsConversion && typeof value === 'number') {
                    return (value - 32) * 5 / 9; // Converte F -> C
                }
                return value;
            });

            const color = `hsl(${(index * 60) % 360}, 70%, 50%)`;

            // Visível apenas se for a coluna selecionada no combobox do mapa
            const selectedColumn = mapDataColumnSelect.value;
            const isSelected = header === selectedColumn ||
                (needsConversion && header.replace('°F', '°C') === selectedColumn);

            return {
                label: needsConversion ? header.replace('°F', '°C') : header,
                data: data,
                borderColor: color,
                backgroundColor: color + '33', // Cor com transparência
                fill: false,
                tension: 0.1,
                hidden: !isSelected,
                pointRadius: data.length > 500 ? 0 : 3, // Sem pontos em datasets grandes
                yAxisID: needsConversion ? 'y_temp' : 'y_default' // Associa ao eixo Y correto
            };
        });

    if (datasets.length === 0) {
        chartMessage.textContent = 'Nenhuma coluna com dados numéricos (além de coordenadas) foi encontrada para plotar no gráfico.';
        chartMessage.style.display = 'block';
        dataChartCanvas.style.display = 'none';
        return;
    }

    // Mostra o gráfico e esconde a mensagem
    chartMessage.style.display = 'none';
    dataChartCanvas.style.display = 'block';

    // Cria o objeto de escalas dinamicamente
    const scales = {
        y_default: { type: 'linear', position: 'left', title: { display: true, text: 'Valores' } }
    };

    // Verifica se algum dataset usa o eixo de temperatura e o adiciona se necessário
    const hasTempData = datasets.some(ds => ds.yAxisID === 'y_temp');
    if (hasTempData) {
        scales.y_temp = { 
            type: 'linear', 
            position: 'right', 
            title: { display: true, text: 'Temperatura (°C)' }, 
            grid: { drawOnChartArea: false } 
        };
    }

    const ctx = dataChartCanvas.getContext('2d');
    dataChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            normalized: true,
            interaction: { mode: 'index', intersect: false },
            scales: scales,
            plugins: {
                title: { display: true, text: 'Visualização dos Indicadores' },
                decimation: { enabled: true, algorithm: 'lttb', samples: 500, threshold: 1000 }
            },
            onClick: (event, elements) => {
                if (!elements || elements.length === 0) return;
                const dataIndex = elements[0].index;
                highlightMapMarker(dataIndex);
            }
        }
    });
}

/**
 * Destaca no mapa o marcador correspondente ao índice clicado no gráfico.
 * Expande o cluster se necessário, centraliza o mapa e abre o popup.
 * @param {number} dataIndex - Índice do ponto clicado no gráfico (= linha do CSV).
 */
function highlightMapMarker(dataIndex) {
    if (!markerClusterGroup || dataIndex < 0 || dataIndex >= markersIndex.length) return;

    const marker = markersIndex[dataIndex];
    if (!marker) return;

    // Remove destaque anterior
    if (highlightMarker && map.hasLayer(highlightMarker)) {
        map.removeLayer(highlightMarker);
        highlightMarker = null;
    }

    // Adiciona um círculo de destaque pulsante na posição do marcador
    const latLng = marker.getLatLng();
    highlightMarker = L.circleMarker(latLng, {
        radius: 18,
        color: '#ff4444',
        weight: 3,
        fillColor: '#ff4444',
        fillOpacity: 0.25
    }).addTo(map);

    // Remove o destaque após 4 segundos
    setTimeout(() => {
        if (highlightMarker && map.hasLayer(highlightMarker)) {
            map.removeLayer(highlightMarker);
            highlightMarker = null;
        }
    }, 4000);

    // Expande o cluster para revelar o marcador, centraliza e abre o popup
    markerClusterGroup.zoomToShowLayer(marker, () => {
        map.setView(latLng, map.getZoom(), { animate: true });
        marker.openPopup();
    });
}

/**
 * Limpa as camadas de dados existentes (marcadores e linhas) do mapa.
 */
function clearMapLayers() {
    if (highlightMarker && map.hasLayer(highlightMarker)) {
        map.removeLayer(highlightMarker);
        highlightMarker = null;
    }
    if (markerClusterGroup && map.hasLayer(markerClusterGroup)) {
        map.removeLayer(markerClusterGroup);
    }
    if (polylineFeatureGroup && map.hasLayer(polylineFeatureGroup)) {
        map.removeLayer(polylineFeatureGroup);
    }
    markerClusterGroup = null;
    polylineFeatureGroup = null;
    markersIndex = [];
}

/**
 * Extrai pontos com coordenadas válidas do CSV e processa os dados selecionados.
 * @param {string} selectedColumn - A coluna de dados selecionada para visualização.
 * @param {boolean} needsConversion - Se os dados precisam de conversão (ex: F para C).
 * @returns {object} - Um objeto contendo { validPoints, minValue, maxValue, hasNumericalData }.
 */
function extractAndProcessPoints(selectedColumn, needsConversion) {
    const latKeys = ['latitude', 'lat'];
    const lonKeys = ['longitude', 'lon', 'lng'];
    let minValue = Infinity;
    let maxValue = -Infinity;

    const validPoints = csvData.map(row => {
        const newRow = { ...row };
        let latitude = null, longitude = null;

        // Encontra coordenadas
        for (const key in newRow) {
            const keyLower = key.trim().toLowerCase();
            if (latitude === null && latKeys.includes(keyLower) && typeof newRow[key] === 'number') latitude = newRow[key];
            if (longitude === null && lonKeys.includes(keyLower) && typeof newRow[key] === 'number') longitude = newRow[key];
        }

        if (latitude === null || longitude === null) return null;

        // Processa o valor da coluna selecionada (incluindo conversão)
        if (selectedColumn && newRow.hasOwnProperty(selectedColumn) && typeof newRow[selectedColumn] === 'number') {
            if (needsConversion) {
                newRow[selectedColumn] = (newRow[selectedColumn] - 32) * 5 / 9; // F -> C
            }
            const value = newRow[selectedColumn];
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
        }

        return { latLng: [latitude, longitude], rowData: newRow };
    }).filter(p => p !== null); // Remove linhas sem coordenadas válidas

    const hasNumericalData = isFinite(minValue) && isFinite(maxValue);
    return { validPoints, minValue, maxValue, hasNumericalData };
}

/**
 * Cria e retorna uma camada de marcadores agrupados (MarkerClusterGroup).
 * @param {Array} validPoints - Array de pontos válidos para plotar.
 * @param {string} selectedColumn - A coluna de dados selecionada.
 * @param {boolean} hasNumericalData - Se há dados numéricos para colorir os marcadores.
 * @returns {L.MarkerClusterGroup} - A camada de marcadores.
 */
function createMarkersLayer(validPoints, selectedColumn, hasNumericalData) {
    markersIndex = []; // Reseta o índice de marcadores

    markerClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 80,
        iconCreateFunction: function(cluster) {
            const childMarkers = cluster.getAllChildMarkers();
            let sum = 0, count = 0;

            if (currentHasNumericalSelectedData && currentSelectedColumn) { // Usa estado global para callback
                childMarkers.forEach(marker => {
                    const value = marker.options.rowData[currentSelectedColumn];
                    if (typeof value === 'number') {
                        sum += value;
                        count++;
                    }
                });
            }

            const displayValue = count > 0 ? (sum / count).toFixed(1) : cluster.getChildCount();
            const color = count > 0 ? getColorForValue(sum / count, currentMinValue, currentMaxValue) : 'rgba(60, 150, 250, 0.7)';
            const size = 30 + Math.min(cluster.getChildCount() / 100, 20);

            return L.divIcon({
                html: `<span style="background-color:${color}">${displayValue}</span>`,
                className: 'my-cluster-icon',
                iconSize: L.point(size, size)
            });
        }
    });

    validPoints.forEach(point => {
        const { latLng, rowData } = point;
        const value = rowData[selectedColumn];
        let popupContent = `<b>Coords:</b> ${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}<br>`;
        let markerColor = 'blue';

        if (selectedColumn && rowData.hasOwnProperty(selectedColumn)) {
            popupContent += `<b>${selectedColumn.replace('°F', '°C')}:</b> ${typeof value === 'number' ? value.toFixed(2) : value}<br>`;
            if (hasNumericalData && typeof value === 'number') {
                markerColor = getColorForValue(value, currentMinValue, currentMaxValue);
            } else {
                markerColor = 'purple'; // Cor para dados não numéricos
            }
        }

        const marker = L.circleMarker(latLng, { color: markerColor, radius: 6, rowData }).bindPopup(popupContent);
        markerClusterGroup.addLayer(marker);
        markersIndex.push(marker); // Armazena referência indexada pela posição no validPoints
    });

    return markerClusterGroup;
}

/**
 * Cria e retorna uma camada com a trajetória (Polyline) colorida pelos dados.
 * @param {Array} validPoints - Array de pontos válidos para a trajetória.
 * @returns {L.FeatureGroup} - A camada da trajetória.
 */
function createPathLayer(validPoints) {
    const latLngs = validPoints.map(p => p.latLng);
    const polyline = L.polyline(latLngs, { color: 'grey', weight: 3, opacity: 0.7 });
    return L.featureGroup([polyline]);
}

// --- Função Principal de Plotagem (Reimplementada) ---
function plotDataOnMap() {
    clearMapLayers();

    if (csvData.length === 0) {
        updateDataChart(); // Limpa o gráfico se não houver dados
        return;
    }

    // 1. Obter estado da UI e processar os dados
    const selectedColumn = mapDataColumnSelect.value;
    const needsConversion = selectedColumn.includes('°F');
    const { validPoints, minValue, maxValue, hasNumericalData } = extractAndProcessPoints(selectedColumn, needsConversion);

    if (validPoints.length === 0) {
        console.warn('Nenhum ponto com coordenadas válidas encontrado no arquivo CSV.');
        updateDataChart(); // Limpa o gráfico se não houver pontos válidos
        return;
    }

    // 2. Atualizar estado global para callbacks (legenda, clusters)
    currentSelectedColumn = selectedColumn;
    currentMinValue = minValue;
    currentMaxValue = maxValue;
    currentHasNumericalSelectedData = hasNumericalData;

    // 3. Criar as camadas do mapa
    const markersLayer = createMarkersLayer(validPoints, selectedColumn, hasNumericalData);
    const pathLayer = createPathLayer(validPoints);
    polylineFeatureGroup = pathLayer; // Atribui ao global para poder limpar depois

    // 4. Adicionar camadas ao mapa e ajustar visualização
    markersLayer.addTo(map);
    pathLayer.addTo(map);
    updateColorLegend(minValue, maxValue, needsConversion);
    map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] });

    // 5. Atualizar o gráfico de linhas
    updateDataChart();
}