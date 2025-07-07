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

// NOVO: Variável global para a instância do Chart.js
let dataChartInstance = null;

// Referências aos elementos do DOM para interatividade e legenda
const csvFileInput = document.getElementById('csvFile');
const dataColumnSelect = document.getElementById('dataColumn');
const columnSelectorDiv = document.getElementById('columnSelector');
const colorLegendDiv = document.getElementById('colorLegend');
const gradientBar = document.getElementById('gradientBar');
const minValLabel = document.getElementById('minValLabel');
const maxValLabel = document.getElementById('maxValLabel');
// NOVO: Referências para o canvas e mensagem do gráfico
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
    dataColumnSelect.innerHTML = '';
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

// --- Funções de Visualização no Mapa (sem alterações nas funções auxiliares) ---

function getColorForValue(value, min, max) {
    if (min === max) {
        return 'hsl(120, 100%, 50%)';
    }
    const normalized = (value - min) / (max - min);
    const hue = 240 - (normalized * 240);
    return `hsl(${hue}, 100%, 50%)`;
}

function updateColorLegend(minVal, maxVal) {
    if (minVal === Infinity || maxVal === -Infinity || !currentHasNumericalSelectedData) {
        colorLegendDiv.style.display = 'none';
        return;
    }
    colorLegendDiv.style.display = 'block';
    minValLabel.textContent = `Min: ${minVal.toFixed(2)}`;
    maxValLabel.textContent = `Max: ${maxVal.toFixed(2)}`;

    const gradientCss = `linear-gradient(to right, ${getColorForValue(minVal, minVal, maxVal)}, ${getColorForValue(maxVal, minVal, maxVal)})`;
    gradientBar.style.background = gradientCss;
}



// --- Função principal para plotar os dados no mapa (e chamar o gráfico) ---
function plotDataOnMap() {
    // 1. Limpa e remove camadas existentes do mapa
    if (markerClusterGroup && map.hasLayer(markerClusterGroup)) {
        map.removeLayer(markerClusterGroup);
    }
    if (polylineFeatureGroup && map.hasLayer(polylineFeatureGroup)) {
        map.removeLayer(polylineFeatureGroup);
    }
    
    markerClusterGroup = null; 
    polylineFeatureGroup = null;

    const selectedColumn = dataColumnSelect.value;
   

    let validPointsData = [];
    let bounds = [];
    
    let minValue = Infinity;
    let maxValue = -Infinity;
    let hasNumericalSelectedDataForPlot = false;

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
                hasNumericalSelectedDataForPlot = true;
            }
        }
    });

    // 2. Atualiza as variáveis globais de estado da escala de cores
    currentMinValue = minValue;
    currentMaxValue = maxValue;
    currentSelectedColumn = selectedColumn;
    currentHasNumericalSelectedData = hasNumericalSelectedDataForPlot;

    updateColorLegend(currentMinValue, currentMaxValue);

    // 3. Re-inicializa o markerClusterGroup com a função de ícone personalizada
    markerClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 80,
        iconCreateFunction: function(cluster) {
            const childMarkers = cluster.getAllChildMarkers();
            let sumValues = 0;
            let countNumerical = 0;

            if (currentHasNumericalSelectedData && currentSelectedColumn) {
                childMarkers.forEach(marker => {
                    const data = marker.options.rowData; 
                    if (data && data.hasOwnProperty(currentSelectedColumn) && typeof data[currentSelectedColumn] === 'number') {
                        sumValues += data[currentSelectedColumn];
                        countNumerical++;
                    }
                });
            }

            let avgValue = 0;
            let displayHtml = '';
            let clusterColor = 'rgba(100, 100, 100, 0.7)'; 

            if (countNumerical > 0) {
                avgValue = sumValues / countNumerical;
                displayHtml = avgValue.toFixed(1);
                clusterColor = getColorForValue(avgValue, currentMinValue, currentMaxValue);
            } else {
                displayHtml = cluster.getChildCount();
                clusterColor = 'rgba(60, 150, 250, 0.7)';
            }
            
            let iconSize = 30 + Math.min(cluster.getChildCount() / validPointsData.length * 20, 30);
            
            return L.divIcon({
                html: `<span>${displayHtml}</span>`,
                className: 'my-cluster-icon', 
                iconSize: L.point(iconSize, iconSize),
                style: `background-color: ${clusterColor};` 
            });
        }
    });
    markerClusterGroup.addTo(map);

    // Inicializa o grupo de polylines
    polylineFeatureGroup = L.featureGroup().addTo(map);

    // 4. Desenhar Marcadores e Segmentos de Linha
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
                markerColor = getColorForValue(dataValue, currentMinValue, currentMaxValue); 
                markerRadius = 5 + ((dataValue - currentMinValue) / (currentMaxValue - currentMinValue) * 5); 
            } else {
                markerColor = 'purple';
            }
        } else {
            popupContent += `<i>Nenhum dado para a coluna selecionada ou valor ausente.</i>`;
        }

        const marker = L.circleMarker(latLng, {
            color: markerColor,
            radius: markerRadius,
            rowData: row
        }).bindPopup(popupContent);
        markerClusterGroup.addLayer(marker);

        if (index < validPointsData.length - 1) {
            const nextLatLng = validPointsData[index + 1].latLng;
            const segmentPoints = [latLng, nextLatLng];

            let segmentColor = 'gray';
            if (selectedColumn && row.hasOwnProperty(selectedColumn) && typeof row[selectedColumn] === 'number') {
                segmentColor = getColorForValue(row[selectedColumn], currentMinValue, currentMaxValue);
            }

            const polylineSegment = L.polyline(segmentPoints, {
                color: segmentColor,
                weight: 4,
                opacity: 0.8,
                lineCap: 'round',
            });
            polylineFeatureGroup.addLayer(polylineSegment);
        }
    });

    // 5. Ajusta o zoom do mapa
    if (validPointsData.length > 0 && map) {
        map.fitBounds(bounds, { padding: [50, 50] }); 
    } else if (map && csvData.length > 0) {
         console.warn('Nenhum ponto válido com coordenadas encontradas no CSV para plotar.');
    }
}