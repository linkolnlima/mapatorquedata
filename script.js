// --- Variáveis Globais e Inicialização ---
let map;
let csvData = [];
// NOVO: Grupo para marcadores clusterizados
let markerClusterGroup = L.markerClusterGroup();
// NOVO: Grupo para os segmentos da linha
let polylineFeatureGroup = L.featureGroup();

// Referências aos elementos do DOM para interatividade e legenda
const csvFileInput = document.getElementById('csvFile');
const dataColumnSelect = document.getElementById('dataColumn');
const columnSelectorDiv = document.getElementById('columnSelector');
const colorLegendDiv = document.getElementById('colorLegend');
const gradientBar = document.getElementById('gradientBar');
const minValLabel = document.getElementById('minValLabel');
const maxValLabel = document.getElementById('maxValLabel');

// Inicializa o mapa ao carregar a página
document.addEventListener('DOMContentLoaded', initMap);

// Função de inicialização do mapa
function initMap() {
    if (map) {
        map.remove();
    }
    map = L.map('map').setView([-14.235, -51.9253], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // NOVO: Adiciona os grupos de camadas ao mapa
    markerClusterGroup.addTo(map);
    polylineFeatureGroup.addTo(map);
}

// --- Funções de Leitura e Processamento de Dados ---

// ... (Restante do código: parseCSVFile, populateDataColumnSelector, event listeners) ...
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
        columnSelectorDiv.style.display = 'flex'; // Exibe o seletor de coluna
        plotDataOnMap(); // Plota os dados iniciais com a primeira opção (nenhum)
    } catch (error) {
        console.error('Erro ao processar o arquivo CSV:', error);
        alert('Erro ao ler o arquivo CSV. Verifique o formato e o console para mais detalhes.');
    }
});

function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,         // Assumir que a primeira linha é o cabeçalho
            dynamicTyping: true,  // Tentar converter strings para números/booleanos
            skipEmptyLines: true, // Ignorar linhas em branco
            complete: (results) => resolve(results),
            error: (error) => reject(error)
        });
    });
}

function populateDataColumnSelector(headers) {
    dataColumnSelect.innerHTML = ''; // Limpa opções existentes
    const commonCoordNames = ['latitude', 'longitude', 'lat', 'lon', 'x', 'y'];

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '--- Selecionar Dado para Cor ---';
    dataColumnSelect.appendChild(defaultOption);

    headers.forEach(header => {
        if (!commonCoordNames.includes(header.toLowerCase()) && header) {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            dataColumnSelect.appendChild(option);
        }
    });
}

dataColumnSelect.addEventListener('change', plotDataOnMap);

// --- Funções de Visualização no Mapa ---

function getColorForValue(value, min, max) {
    if (min === max) {
        return 'hsl(120, 100%, 50%)'; // Verde para valores constantes
    }
    const normalized = (value - min) / (max - min);
    const hue = 240 - (normalized * 240);
    return `hsl(${hue}, 100%, 50%)`;
}

function updateColorLegend(minVal, maxVal) {
    if (minVal === Infinity || maxVal === -Infinity) {
        colorLegendDiv.style.display = 'none';
        return;
    }
    colorLegendDiv.style.display = 'block';
    minValLabel.textContent = `Min: ${minVal.toFixed(2)}`;
    maxValLabel.textContent = `Max: ${maxVal.toFixed(2)}`;

    const gradientCss = `linear-gradient(to right, ${getColorForValue(minVal, minVal, maxVal)}, ${getColorForValue(maxVal, minVal, maxVal)})`;
    gradientBar.style.background = gradientCss;
}

// Função principal para plotar os dados no mapa
function plotDataOnMap() {
    // NOVO: Limpa os grupos de camadas
    markerClusterGroup.clearLayers();
    polylineFeatureGroup.clearLayers();

    const selectedColumn = dataColumnSelect.value;
    const commonCoordNames = ['latitude', 'longitude', 'lat', 'lon', 'x', 'y'];

    let validPointsData = [];
    let bounds = [];
    
    let minValue = Infinity;
    let maxValue = -Infinity;
    let hasNumericalSelectedData = false;

    csvData.forEach(row => {
        let latitude = null;
        let longitude = null;

        let key =' Latitude';
        if (row.hasOwnProperty(key) && typeof row[key] === 'number' && row[key] >= -90 && row[key] <= 90) {
                latitude = row[key];
        }
        key =' Longitude';
        
        if (row.hasOwnProperty(key) && typeof row[key] === 'number' && row[key] >= -180 && row[key] <= 180) {
            longitude = row[key];
        }
        
        if (latitude !== null && longitude !== null) {
            validPointsData.push({
                latLng: [latitude, longitude],
                rowData: row
            });
            bounds.push([latitude, longitude]);

            if (selectedColumn && row.hasOwnProperty(selectedColumn) && typeof row[selectedColumn] === 'number') {
                const dataValue = row[selectedColumn];
                minValue = Math.min(minValue, dataValue);
                maxValue = Math.max(maxValue, dataValue);
                hasNumericalSelectedData = true;
            }
        }
    });

    if (!hasNumericalSelectedData || minValue === Infinity) {
        minValue = 0;
        maxValue = 1;
        updateColorLegend(Infinity, -Infinity);
    } else {
        updateColorLegend(minValue, maxValue);
    }

    validPointsData.forEach((pointData, index) => {
        const latLng = pointData.latLng;
        const row = pointData.rowData;

        let popupContent = `<b>Coordenadas:</b> ${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}<br>`;
        let markerColor = 'blue';
        let markerRadius = 8;

        if (selectedColumn && row.hasOwnProperty(selectedColumn) && row[selectedColumn] !== undefined && row[selectedColumn] !== null) {
            const dataValue = row[selectedColumn];
            popupContent += `<b>${selectedColumn}:</b> ${dataValue}<br>`;

            if (typeof dataValue === 'number') {
                markerColor = getColorForValue(dataValue, minValue, maxValue);
                markerRadius = 5 + ((dataValue - minValue) / (maxValue - minValue) * 5); 
            } else {
                markerColor = 'purple';
            }
        } else {
            popupContent += `<i>Nenhum dado para a coluna selecionada ou valor ausente.</i>`;
        }

        const marker = L.circleMarker(latLng, { color: markerColor, radius: markerRadius })
            .bindPopup(popupContent);
        // NOVO: Adiciona o marcador ao grupo de cluster
        markerClusterGroup.addLayer(marker);

        if (index < validPointsData.length - 1) {
            const nextLatLng = validPointsData[index + 1].latLng;
            const segmentPoints = [latLng, nextLatLng];

            let segmentColor = 'gray';
            if (selectedColumn && row.hasOwnProperty(selectedColumn) && typeof row[selectedColumn] === 'number') {
                segmentColor = getColorForValue(row[selectedColumn], minValue, maxValue);
            }

            const polylineSegment = L.polyline(segmentPoints, {
                color: segmentColor,
                weight: 4,
                opacity: 0.8,
                lineCap: 'round',
                // Opcional: tentar renderizar em Canvas para linhas também (pode não ter ganho para muitos segmentos individuais)
                // renderer: L.canvas() 
            });
            // NOVO: Adiciona o segmento de linha ao grupo de linhas
            polylineFeatureGroup.addLayer(polylineSegment);
        }
    });

    if (validPointsData.length > 0 && map) {
        map.fitBounds(bounds, { padding: [50, 50] }); 
    } else if (map && csvData.length > 0) {
         console.warn('Nenhum ponto válido com coordenadas encontradas no CSV para plotar.');
    }
}