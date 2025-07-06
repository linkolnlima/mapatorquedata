// Variáveis globais
let map;
let csvData = [];
let markers = L.featureGroup(); // Grupo para gerenciar os marcadores

// Função para inicializar o mapa
function initMap() {
    if (map) { // Se o mapa já existe, não crie novamente
        map.remove();
    }
    map = L.map('map').setView([-19.9167, -43.9333], 10); // Coordenadas de exemplo (Belo Horizonte), zoom
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markers.addTo(map); // Adiciona o grupo de marcadores ao mapa
}

// Chamar initMap quando a página carregar
document.addEventListener('DOMContentLoaded', initMap);

// Obter referências aos elementos do DOM
const csvFile = document.getElementById('csvFile');
const dataColumnSelector = document.getElementById('dataColumn');
const columnSelectorDiv = document.getElementById('columnSelector');

// Event listener para o input de arquivo
csvFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        // Usar Papa Parse para ler o CSV
        Papa.parse(file, {
            header: true, // Assumir que a primeira linha é o cabeçalho
            dynamicTyping: true, // Tentar converter strings para números/booleanos
            skipEmptyLines: true,
            complete: function(results) {
                csvData = results.data;
                console.log('Dados CSV carregados:', csvData);
                populateColumnSelector(results.meta.fields);
                columnSelectorDiv.style.display = 'block'; // Mostrar o seletor de coluna
                plotDataOnMap(); // Plotar os dados iniciais
            },
            error: function(error) {
                console.error('Erro ao ler o CSV:', error);
                alert('Erro ao ler o arquivo CSV. Verifique o formato.');
            }
        });
    }
});

// Preencher o seletor de coluna com base nos cabeçalhos do CSV
function populateColumnSelector(headers) {
    dataColumnSelector.innerHTML = ''; // Limpar opções existentes
    const commonCoords = ['latitude', 'longitude', 'lat', 'lon', 'x', 'y']; // Colunas a ignorar ou priorizar

    // Adiciona uma opção para "Nenhum" ou "Somente Localização"
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Selecionar Dado...';
    dataColumnSelector.appendChild(defaultOption);

    headers.forEach(header => {
        // Ignorar colunas de coordenada ao preencher o seletor de dados
        if (!commonCoords.includes(header.toLowerCase())) {
            const option = document.createElement('option');
            option.value = header;
            option.textContent = header;
            dataColumnSelector.appendChild(option);
        }
    });
}

// Event listener para a seleção de coluna de dados
dataColumnSelector.addEventListener('change', plotDataOnMap);

// Função para plotar os dados no mapa
function plotDataOnMap() {
    markers.clearLayers(); // Limpa todos os marcadores e linhas existentes

    const selectedColumn = dataColumnSelector.value;
    const minLat = -90;
    const maxLat = 90;
    const minLon = -180;
    const maxLon = 180;

    let validPointsCount = 0;
    let bounds = []; // Para ajustar o zoom do mapa
    let polylineCoordinates = []; // NOVO: Array para armazenar as coordenadas da linha

    csvData.forEach(row => {
        // Tentar identificar as colunas de latitude e longitude (insensível a maiúsculas/minúsculas)
        const latKeys = [' Latitude', 'lat', 'y'];
        const lonKeys = [' Longitude', 'lon', 'x'];

        let latitude = null;
        let longitude = null;

        for (const key of latKeys) {
            if (row.hasOwnProperty(key) && typeof row[key] === 'number') {
                latitude = row[key];
                break;
            }
        }
        for (const key of lonKeys) {
            if (row.hasOwnProperty(key) && typeof row[key] === 'number') {
                longitude = row[key];
                break;
            }
        }
        
        // Validação básica das coordenadas
        if (latitude !== null && longitude !== null && 
            latitude >= minLat && latitude <= maxLat && 
            longitude >= minLon && longitude <= maxLon) {
            
            validPointsCount++;
            const latLng = [latitude, longitude];
            bounds.push(latLng); // Adiciona para calcular o fitBounds
            polylineCoordinates.push(latLng); // NOVO: Adiciona a coordenada à lista para a linha

            let popupContent = `<b>Coordenadas:</b> ${latitude.toFixed(4)}, ${longitude.toFixed(4)}<br>`;
            let markerOptions = { color: 'blue', radius: 8 }; // Opções padrão

            if (selectedColumn && row[selectedColumn] !== undefined && row[selectedColumn] !== null) {
                const dataValue = row[selectedColumn];
                popupContent += `<b>${selectedColumn}:</b> ${dataValue}<br>`;

                // Exemplo de como colorir/dimensionar o marcador com base no valor da coluna
                if (typeof dataValue === 'number') {
                    const colorIntensity = Math.min(1, Math.max(0, dataValue / 100)); // Supondo valor máximo de 100
                    markerOptions.color = `hsl(${240 - (colorIntensity * 240)}, 100%, 50%)`;
                    markerOptions.radius = 5 + (colorIntensity * 10);
                } else {
                    markerOptions.color = 'green';
                }
            } else {
                popupContent += `<i>Nenhum dado selecionado ou valor ausente para a coluna.</i>`;
            }

            // Criar e adicionar o marcador
            const marker = L.circleMarker(latLng, markerOptions)
                .bindPopup(popupContent);
            
            markers.addLayer(marker); // Adiciona ao grupo de marcadores
        } else {
            // console.warn('Ponto inválido ou sem coordenadas:', row);
        }
    });

    // NOVO: Desenhar a linha após processar todos os pontos
    if (polylineCoordinates.length >= 2) { // Uma linha requer pelo menos 2 pontos
        const polyline = L.polyline(polylineCoordinates, {
            color: 'red',        // Cor da linha
            weight: 3,           // Espessura da linha
            opacity: 0.7         // Opacidade da linha
        });
        markers.addLayer(polyline); // Adiciona a linha ao grupo de marcadores
    }

    if (validPointsCount > 0 && map) {
        // Ajusta o zoom e a centralização do mapa para mostrar todos os marcadores e a linha
        map.fitBounds(bounds, { padding: [50, 50] }); 
    } else if (map && csvData.length > 0) {
         console.warn('Nenhum ponto válido encontrado no CSV para plotar.');
    }
}

// Nota: Para este exemplo funcionar, o seu CSV deve ter colunas como "latitude" e "longitude" (ou variações como "lat", "lon", "y", "x")
// e outras colunas com dados que você deseja visualizar.