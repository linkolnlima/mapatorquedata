// --- Variáveis Globais e Inicialização ---
let map;
let csvData = [];
// Usamos um L.featureGroup para gerenciar marcadores E segmentos de linha juntos,
// facilitando a limpeza do mapa a cada nova plotagem.
let mapLayers = L.featureGroup();

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
    if (map) { // Evita recriar o mapa se já existir (útil em Single Page Apps)
        map.remove();
    }
    // Configura o mapa com uma visão inicial sobre o Brasil (exemplo)
    map = L.map('map').setView([-14.235, -51.9253], 4); // Centro do Brasil, zoom global
    // Adiciona a camada de tiles do OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    mapLayers.addTo(map); // Adiciona o grupo de camadas ao mapa
}

// --- Funções de Leitura e Processamento de Dados ---

// Event listener para o input de arquivo CSV
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

// Wrapper para Papa Parse com Promise (para usar async/await)
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

// Preenche o seletor de coluna com base nos cabeçalhos do CSV
function populateDataColumnSelector(headers) {
    dataColumnSelect.innerHTML = ''; // Limpa opções existentes
    // Colunas de coordenadas comuns a serem ignoradas no seletor de dados
    const commonCoordNames = [' Latitude', ' Longitude', 'lat', 'lon', 'x', 'y'];

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '--- Selecionar Dado para Cor ---';
    dataColumnSelect.appendChild(defaultOption);

    headers.forEach(header => {
        // Filtra colunas que são provavelmente coordenadas
        if (!commonCoordNames.includes(header.toLowerCase()) && header) { // header && para evitar strings vazias
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            dataColumnSelect.appendChild(option);
        }
    });
}

// Event listener para a seleção de coluna de dados
dataColumnSelect.addEventListener('change', plotDataOnMap);

// --- Funções de Visualização no Mapa ---

/**
 * Calcula a cor HSL para um valor dado, dentro de um espectro definido pelos valores mínimo e máximo.
 * O espectro vai de azul (hue 240) para vermelho (hue 0).
 * @param {number} value - O valor a ser mapeado para uma cor.
 * @param {number} min - O valor mínimo do espectro.
 * @param {number} max - O valor máximo do espectro.
 * @returns {string} - Uma string de cor HSL.
 */
function getColorForValue(value, min, max) {
    if (min === max) {
        return 'hsl(120, 100%, 50%)'; // Verde para valores constantes
    }
    // Normaliza o valor para uma escala de 0 a 1
    const normalized = (value - min) / (max - min);
    // Interpola o hue de azul (240) para vermelho (0)
    const hue = 240 - (normalized * 240);
    return `hsl(${hue}, 100%, 50%)`; // Saturação e luminosidade constantes
}

/**
 * Atualiza a legenda de cores no DOM.
 * @param {number} minVal - Valor mínimo do dado.
 * @param {number} maxVal - Valor máximo do dado.
 */
function updateColorLegend(minVal, maxVal) {
    if (minVal === Infinity || maxVal === -Infinity) { // Nenhum dado numérico válido
        colorLegendDiv.style.display = 'none';
        return;
    }
    colorLegendDiv.style.display = 'block';
    minValLabel.textContent = `Min: ${minVal.toFixed(2)}`;
    maxValLabel.textContent = `Max: ${maxVal.toFixed(2)}`;

    // Cria um gradiente CSS para a barra da legenda
    const gradientCss = `linear-gradient(to right, ${getColorForValue(minVal, minVal, maxVal)}, ${getColorForValue(maxVal, minVal, maxVal)})`;
    gradientBar.style.background = gradientCss;
}


// Função principal para plotar os dados no mapa
function plotDataOnMap() {
    mapLayers.clearLayers(); // Limpa todos os marcadores e linhas existentes do grupo

    const selectedColumn = dataColumnSelect.value;

    let validPointsData = []; // Armazena pontos válidos com seus dados originais
    let bounds = []; // Para ajustar o zoom do mapa
    
    // --- Etapa 1: Filtrar pontos válidos e determinar min/max para a coluna selecionada ---
    let minValue = Infinity;
    let maxValue = -Infinity;
    let hasNumericalSelectedData = false;

    csvData.forEach(row => {
        // Tentar identificar as colunas de latitude e longitude (insensível a maiúsculas/minúsculas)
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
                rowData: row // Mantém o acesso aos dados da linha original
            });
            bounds.push([latitude, longitude]);

            // Se uma coluna de dado foi selecionada e é numérica, atualiza min/max
            if (selectedColumn && row.hasOwnProperty(selectedColumn) && typeof row[selectedColumn] === 'number') {
                const dataValue = row[selectedColumn];
                minValue = Math.min(minValue, dataValue);
                maxValue = Math.max(maxValue, dataValue);
                hasNumericalSelectedData = true;
            }
        }
    });

    // Ajusta min/max se não houver dados numéricos para a coluna selecionada
    if (!hasNumericalSelectedData || minValue === Infinity) {
        minValue = 0; // Fallback para evitar erros na escala
        maxValue = 1;
        updateColorLegend(Infinity, -Infinity); // Esconde a legenda
    } else {
        updateColorLegend(minValue, maxValue); // Atualiza a legenda
    }

    // --- Etapa 2: Desenhar Marcadores e Segmentos de Linha ---
    validPointsData.forEach((pointData, index) => {
        const latLng = pointData.latLng;
        const row = pointData.rowData;

        let popupContent = `<b>Coordenadas:</b> ${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}<br>`;
        let markerColor = 'blue'; // Cor padrão do marcador
        let markerRadius = 8; // Raio padrão do marcador

        // Se a coluna de dados foi selecionada e possui valor, personalize o marcador
        if (selectedColumn && row.hasOwnProperty(selectedColumn) && row[selectedColumn] !== undefined && row[selectedColumn] !== null) {
            const dataValue = row[selectedColumn];
            popupContent += `<b>${selectedColumn}:</b> ${dataValue}<br>`;

            if (typeof dataValue === 'number') {
                markerColor = getColorForValue(dataValue, minValue, maxValue); // Cor do marcador baseada no seu próprio valor
                // Escala o raio do marcador (ex: de 5 a 10px)
                markerRadius = 5 + ((dataValue - minValue) / (maxValue - minValue) * 5); 
            } else {
                markerColor = 'purple'; // Cor diferente para dados não numéricos
            }
        } else {
            popupContent += `<i>Nenhum dado para a coluna selecionada ou valor ausente.</i>`;
        }

        const marker = L.circleMarker(latLng, { color: markerColor, radius: markerRadius })
            .bindPopup(popupContent);
        mapLayers.addLayer(marker);

        // Desenha um segmento de linha do ponto atual para o próximo ponto
        if (index < validPointsData.length - 1) {
            const nextLatLng = validPointsData[index + 1].latLng;
            const segmentPoints = [latLng, nextLatLng];

            // A cor do segmento é baseada no valor do ponto *inicial* do segmento
            let segmentColor = 'gray'; // Cor padrão da linha se não houver dado numérico
            if (selectedColumn && row.hasOwnProperty(selectedColumn) && typeof row[selectedColumn] === 'number') {
                segmentColor = getColorForValue(row[selectedColumn], minValue, maxValue);
            }

            const polylineSegment = L.polyline(segmentPoints, {
                color: segmentColor,
                weight: 4,
                opacity: 0.8,
                lineCap: 'round' // Aparência mais suave das junções
            });
            mapLayers.addLayer(polylineSegment);
        }
    });

    // Ajusta o zoom do mapa para incluir todos os pontos válidos
    if (validPointsData.length > 0 && map) {
        map.fitBounds(bounds, { padding: [50, 50] }); 
    } else if (map && csvData.length > 0) {
         console.warn('Nenhum ponto válido com coordenadas encontradas no CSV para plotar.');
    }
}