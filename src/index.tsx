
import { GoogleGenAI } from "@google/genai";

// Attempt to get API_KEY from environment.
const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  try {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  } catch (error) {
    console.error("Error initializing GoogleGenAI:", error);
  }
} else {
  console.warn("API_KEY not found or is invalid. Gemini API features will be unavailable.");
}


// --- Data Structures ---
interface CatalogExerciseItem {
    id: string; // e.g., "peito_supino_reto"
    name: string;
}
interface ExerciseCatalog {
    [categoryKey: string]: CatalogExerciseItem[];
}

interface Exercise { // For WorkoutDayTemplate
    id: string; // UUID, unique for this template entry
    categoryKey: string; // Key from EXERCISE_CATALOG e.g. "Peito"
    exerciseItemKey: string; // id from CatalogExerciseItem e.g. "peito_supino_reto"
    name: string; // Copied name for convenience
    defaultLoadKg: number;
    defaultSets: number;
    defaultReps: string; 
}

interface WorkoutDayTemplate {
    dayKey: string; 
    dayName: string; 
    muscleGroups: string[]; // Higher-level groups for the day like "Braços", "Pernas"
    exercises: Exercise[];
    isWorkoutDay: boolean;
}

interface LoggedExerciseData {
    categoryKey: string;
    exerciseItemKey: string;
    name: string; 
    loadKg: number;
    sets: number;
    reps: string;
}

interface WorkoutLog {
    id: string;
    dateISO: string; 
    dayKey: string; 
    loggedExercises: LoggedExerciseData[];
    notes: string;
}

interface BodyMeasurementDefinition {
    key: string;
    name: string;
    unit: string;
    step?: string; // For number input step
}

interface BodyMeasurementValues {
    [key: string]: number | string; // string for date or general notes
}

interface BodyMeasurementLogEntry {
    id: string;
    dateISO: string;
    measurements: BodyMeasurementValues;
    notes: string;
}


// --- Constants ---
const AVAILABLE_MUSCLE_GROUPS: string[] = ["Braços", "Ombros", "Costas", "Peito", "Pernas", "Abdômen", "Cardio", "Full Body"];
const MAX_LOG_EXERCISE_SLOTS = 6;

const EXERCISE_CATALOG: ExerciseCatalog = {
    "Peito": [
        { id: "peito_supino_reto", name: "Supino Reto (com barra ou máquina)" },
        { id: "peito_supino_inclinado_declinado", name: "Supino Inclinado/Declinado" },
        { id: "peito_crossover", name: "Crossover (ou Polia Crossover)" },
        { id: "peito_peck_deck", name: "Peck Deck (Crucifixo na máquina)" },
        { id: "peito_flexao_solo", name: "Flexão no solo (peso corporal)" }
    ],
    "Costas": [
        { id: "costas_puxada_frente", name: "Puxada na frente (Pulldown)" },
        { id: "costas_remada_baixa", name: "Remada baixa" },
        { id: "costas_remada_unilateral_halteres", name: "Remada unilateral com halteres" },
        { id: "costas_remada_cavalinho", name: "Remada cavalinho (T-Bar Row)" },
        { id: "costas_barra_fixa", name: "Barra fixa (ou máquina assistida)" }
    ],
    "Bíceps": [
        { id: "biceps_rosca_direta", name: "Rosca direta (barra)" },
        { id: "biceps_rosca_alternada", name: "Rosca alternada (halteres)" },
        { id: "biceps_rosca_concentrada", name: "Rosca concentrada" },
        { id: "biceps_rosca_scott", name: "Rosca scott (máquina ou banco)" }
    ],
    "Tríceps": [
        { id: "triceps_polia", name: "Tríceps na polia (corda ou barra)" },
        { id: "triceps_testa", name: "Tríceps testa (com barra W ou halteres)" },
        { id: "triceps_banco", name: "Tríceps banco (peso corporal)" }
    ],
    "Ombros": [
        { id: "ombros_desenvolvimento", name: "Desenvolvimento com halteres ou máquina" },
        { id: "ombros_elevacao_lateral", name: "Elevação lateral (halteres ou polia)" },
        { id: "ombros_elevacao_frontal", name: "Elevação frontal" },
        { id: "ombros_remada_alta", name: "Remada alta" },
        { id: "ombros_crucifixo_inverso", name: "Crucifixo invertido (deltoide posterior)" }
    ],
    "Quadríceps e Glúteos": [
        { id: "quads_leg_press", name: "Leg Press" },
        { id: "quads_agachamento", name: "Agachamento (livre ou guiado)" },
        { id: "quads_extensora", name: "Extensora" },
        { id: "quads_avanco", name: "Avanço (passada com halteres ou barra)" }
    ],
    "Posteriores de Coxa": [
        { id: "postcoxa_mesa_flexora", name: "Mesa flexora (leg curl)" },
        { id: "postcoxa_stiff", name: "Stiff (com barra ou halteres)" }
    ],
    "Panturrilha": [
        { id: "pant_elevacao_sentado", name: "Elevação na máquina sentado" },
        { id: "pant_elevacao_pe", name: "Elevação em pé (Smith ou máquina específica)" }
    ],
    "Abdômen": [
        { id: "abs_solo", name: "Abdominal no solo (reto, oblíquo)" },
        { id: "abs_maquina", name: "Abdominal na máquina" },
        { id: "abs_elevacao_pernas_paralela", name: "Elevação de pernas na paralela" },
        { id: "abs_prancha", name: "Prancha isométrica (peso corporal)" }
    ]
};

const AVAILABLE_BODY_MEASUREMENTS: BodyMeasurementDefinition[] = [
    { key: "peso", name: "Peso Corporal", unit: "kg", step: "0.1" },
    { key: "altura", name: "Altura", unit: "cm", step: "0.5" },
    { key: "percGordura", name: "Percentual de Gordura", unit: "%", step: "0.1" },
    { key: "imc", name: "IMC", unit: "", step: "0.1" },
    { key: "peitoral", name: "Peitoral (Tórax)", unit: "cm", step: "0.5" },
    { key: "bracoDirCont", name: "Braço Direito (contraído)", unit: "cm", step: "0.5" },
    { key: "bracoEsqCont", name: "Braço Esquerdo (contraído)", unit: "cm", step: "0.5" },
    { key: "antebracoDir", name: "Antebraço Direito (relaxado)", unit: "cm", step: "0.5" },
    { key: "antebracoEsq", name: "Antebraço Esquerdo (relaxado)", unit: "cm", step: "0.5" },
    { key: "cintura", name: "Cintura", unit: "cm", step: "0.5" },
    { key: "abdomen", name: "Abdômen (Barriga)", unit: "cm", step: "0.5" },
    { key: "quadril", name: "Quadril (Glúteos)", unit: "cm", step: "0.5" },
    { key: "coxaDir", name: "Coxa Direita", unit: "cm", step: "0.5" },
    { key: "coxaEsq", name: "Coxa Esquerda", unit: "cm", step: "0.5" },
    { key: "panturrilhaDir", name: "Panturrilha Direita", unit: "cm", step: "0.5" },
    { key: "panturrilhaEsq", name: "Panturrilha Esquerda", unit: "cm", step: "0.5" },
    { key: "pescoco", name: "Pescoço", unit: "cm", step: "0.5" },
    { key: "ombros", name: "Ombros (Circunferência)", unit: "cm", step: "0.5" },
];


// --- State ---
let currentTheme: 'light' | 'dark' = 'light';
let workoutTemplates: WorkoutDayTemplate[] = []; 
let workoutHistory: WorkoutLog[] = [];
let bodyMeasurementHistory: BodyMeasurementLogEntry[] = [];
let selectedDayKey: string | null = null;
let isLoggingWorkout: boolean = false;
let editingDayKey: string | null = null; 
let editingBodyMeasurementLogId: string | null = null;


// --- LocalStorage Keys ---
const WORKOUT_TEMPLATES_KEY = 'didiFit_workoutTemplates_v3'; 
const WORKOUT_HISTORY_KEY = 'didiFit_workoutHistory_v2'; 
const THEME_KEY = 'didiFit_theme_v1';
const BODY_MEASUREMENT_HISTORY_KEY = 'didiFit_bodyMeasurementHistory_v1';

// --- Utility Functions ---
function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getTodayISOString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- LocalStorage Functions ---
function saveData() {
    try {
        localStorage.setItem(WORKOUT_TEMPLATES_KEY, JSON.stringify(workoutTemplates));
        localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(workoutHistory));
        localStorage.setItem(BODY_MEASUREMENT_HISTORY_KEY, JSON.stringify(bodyMeasurementHistory));
        localStorage.setItem(THEME_KEY, currentTheme);
    } catch (e) {
        console.error("Error saving data to localStorage:", e);
        alert("Não foi possível salvar os dados. O armazenamento local pode estar cheio ou indisponível.");
    }
}

function loadData() {
    const storedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
        currentTheme = storedTheme;
    }

    const storedTemplates = localStorage.getItem(WORKOUT_TEMPLATES_KEY);
    if (storedTemplates) {
        const parsedTemplates = JSON.parse(storedTemplates) as WorkoutDayTemplate[];
        // Basic validation for new structure
        if (Array.isArray(parsedTemplates) && parsedTemplates.length === 7 &&
            'isWorkoutDay' in parsedTemplates[0] &&
            (!parsedTemplates[0].exercises[0] || 'categoryKey' in parsedTemplates[0].exercises[0])) {
            workoutTemplates = parsedTemplates;
        } else {
            console.warn("Stored workout templates are in an old or invalid format. Resetting to default.");
            initializeDefaultWorkoutTemplates();
        }
    } else {
        initializeDefaultWorkoutTemplates();
    }

    const storedHistory = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (storedHistory) {
         const parsedHistory = JSON.parse(storedHistory) as WorkoutLog[];
         // Basic validation for new structure
         if (Array.isArray(parsedHistory) && (!parsedHistory[0] || !parsedHistory[0].loggedExercises[0] || 'categoryKey' in parsedHistory[0].loggedExercises[0])) {
            workoutHistory = parsedHistory;
         } else {
            console.warn("Stored workout history is in an old or invalid format. Clearing history.");
            workoutHistory = [];
         }
    }
    
    const storedBodyMeasurements = localStorage.getItem(BODY_MEASUREMENT_HISTORY_KEY);
    if (storedBodyMeasurements) {
        const parsedMeasurements = JSON.parse(storedBodyMeasurements) as BodyMeasurementLogEntry[];
        if (Array.isArray(parsedMeasurements)) {
            bodyMeasurementHistory = parsedMeasurements;
        } else {
            console.warn("Stored body measurements are in an invalid format. Clearing.");
            bodyMeasurementHistory = [];
        }
    }


    workoutTemplates.forEach(t => {
        if (!t.exercises) t.exercises = [];
        if (!t.muscleGroups) t.muscleGroups = [];
    });
    saveData();
}

function initializeDefaultWorkoutTemplates() {
    workoutTemplates = [ 
        { dayKey: "segunda", dayName: "Segunda", muscleGroups: ["Braços", "Ombros"], exercises: [], isWorkoutDay: true },
        { dayKey: "terca", dayName: "Terça", muscleGroups: [], exercises: [], isWorkoutDay: false },
        { dayKey: "quarta", dayName: "Quarta", muscleGroups: ["Costas", "Peito"], exercises: [], isWorkoutDay: true },
        { dayKey: "quinta", dayName: "Quinta", muscleGroups: [], exercises: [], isWorkoutDay: false },
        { dayKey: "sexta", dayName: "Sexta", muscleGroups: ["Pernas", "Abdômen"], exercises: [], isWorkoutDay: true },
        { dayKey: "sabado", dayName: "Sábado", muscleGroups: [], exercises: [], isWorkoutDay: false },
        { dayKey: "domingo", dayName: "Domingo", muscleGroups: [], exercises: [], isWorkoutDay: false },
    ];
    
    workoutTemplates.forEach(template => {
        if (template.isWorkoutDay) {
            if (template.dayKey === "segunda") { // Braços e Ombros
                template.exercises.push({ id: uuidv4(), categoryKey: "Peito", exerciseItemKey: "peito_supino_reto", name: EXERCISE_CATALOG["Peito"].find(ex => ex.id === "peito_supino_reto")!.name, defaultLoadKg: 60, defaultSets: 3, defaultReps: "8-10" });
                template.exercises.push({ id: uuidv4(), categoryKey: "Ombros", exerciseItemKey: "ombros_desenvolvimento", name: EXERCISE_CATALOG["Ombros"].find(ex => ex.id === "ombros_desenvolvimento")!.name, defaultLoadKg: 12, defaultSets: 3, defaultReps: "10-12" });
                template.exercises.push({ id: uuidv4(), categoryKey: "Bíceps", exerciseItemKey: "biceps_rosca_direta", name: EXERCISE_CATALOG["Bíceps"].find(ex => ex.id === "biceps_rosca_direta")!.name, defaultLoadKg: 12, defaultSets: 3, defaultReps: "10-12" });
            } else if (template.dayKey === "quarta") { // Costas e Peito
                 template.exercises.push({ id: uuidv4(), categoryKey: "Costas", exerciseItemKey: "costas_barra_fixa", name: EXERCISE_CATALOG["Costas"].find(ex => ex.id === "costas_barra_fixa")!.name, defaultLoadKg: 0, defaultSets: 3, defaultReps: "Máx" });
                 const remadaCurvada = EXERCISE_CATALOG["Costas"].find(ex => ex.name.includes("Remada Curvada")) || EXERCISE_CATALOG["Costas"].find(ex => ex.id === "costas_remada_baixa")!;
                 template.exercises.push({ id: uuidv4(), categoryKey: "Costas", exerciseItemKey: remadaCurvada.id, name: remadaCurvada.name, defaultLoadKg: 50, defaultSets: 3, defaultReps: "8-10" });
            } else if (template.dayKey === "sexta") { // Pernas e Abdômen
                template.exercises.push({ id: uuidv4(), categoryKey: "Quadríceps e Glúteos", exerciseItemKey: "quads_agachamento", name: EXERCISE_CATALOG["Quadríceps e Glúteos"].find(ex => ex.id === "quads_agachamento")!.name, defaultLoadKg: 70, defaultSets: 4, defaultReps: "6-8" });
                template.exercises.push({ id: uuidv4(), categoryKey: "Quadríceps e Glúteos", exerciseItemKey: "quads_leg_press", name: EXERCISE_CATALOG["Quadríceps e Glúteos"].find(ex => ex.id === "quads_leg_press")!.name, defaultLoadKg: 120, defaultSets: 3, defaultReps: "10-12" });
                template.exercises.push({ id: uuidv4(), categoryKey: "Abdômen", exerciseItemKey: "abs_prancha", name: EXERCISE_CATALOG["Abdômen"].find(ex => ex.id === "abs_prancha")!.name, defaultLoadKg: 0, defaultSets: 3, defaultReps: "60s" });
            }
        }
    });
    saveData();
}


// --- UI Rendering Functions ---
function renderTheme() {
    document.body.className = currentTheme;
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const moonIcon = themeToggle.querySelector('.icon-moon');
        const sunIcon = themeToggle.querySelector('.icon-sun');
        if (moonIcon) (moonIcon as HTMLElement).style.display = currentTheme === 'light' ? 'inline' : 'none';
        if (sunIcon) (sunIcon as HTMLElement).style.display = currentTheme === 'dark' ? 'inline' : 'none';
        themeToggle.setAttribute('aria-label', currentTheme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro');
    }
}

function renderSchedule() {
    const daysContainer = document.querySelector('#schedule-view .days-container');
    if (!daysContainer) return;

    daysContainer.innerHTML = workoutTemplates.map(day => {
        let statusText = "Dia de Descanso";
        if (day.isWorkoutDay) {
            if (day.muscleGroups.length > 0) {
                statusText = day.muscleGroups.join(' & ');
            } else {
                statusText = "Dia de Treino - Defina os grupos";
            }
        }
        return `
        <div class="day-card ${day.isWorkoutDay ? 'workout-day' : ''} ${selectedDayKey === day.dayKey ? 'selected' : ''}" 
             data-daykey="${day.dayKey}" 
             role="button" 
             tabindex="0"
             aria-pressed="${selectedDayKey === day.dayKey}"
             aria-label="${day.dayName}: ${statusText}. Clique para selecionar, ou use o botão de edição para configurar.">
            
            <div class="day-card-content" data-daykey-select="${day.dayKey}">
                <h3>${day.dayName}</h3>
                <p class="day-status">${statusText}</p>
            </div>
            <div class="day-card-actions">
                <button class="edit-day-btn icon-btn" data-daykey-edit="${day.dayKey}" aria-label="Editar configuração do treino de ${day.dayName}" title="Editar Dia">✏️</button>
            </div>
        </div>
    `}).join('');

    document.querySelectorAll('.day-card-content').forEach(cardContent => {
        cardContent.addEventListener('click', () => handleDaySelection(cardContent.getAttribute('data-daykey-select')));
    });
    document.querySelectorAll('.day-card').forEach(card => {
        card.addEventListener('keydown', (event) => {
            if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') {
                if ((event.target as HTMLElement).classList.contains('edit-day-btn')) return; 
                event.preventDefault();
                handleDaySelection(card.getAttribute('data-daykey'));
            }
        });
    });
    document.querySelectorAll('.edit-day-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            handleOpenEditDayModal(btn.getAttribute('data-daykey-edit'));
        });
    });
}

function renderSelectedDayDetails() {
    const selectedDayInfoEl = document.getElementById('selected-day-info');
    const exerciseListContainer = document.getElementById('exercise-list-container');
    const addExerciseBtn = document.getElementById('add-exercise-to-template-btn') as HTMLButtonElement;
    const logWorkoutBtn = document.getElementById('log-workout-btn') as HTMLButtonElement;

    if (!selectedDayInfoEl || !exerciseListContainer || !addExerciseBtn || !logWorkoutBtn) return;

    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);

    if (template) {
        let infoHtml = `<h4>${template.dayName}</h4>`;
        if (template.isWorkoutDay) {
            if (template.muscleGroups.length > 0) {
                infoHtml += `<p>Treino de: ${template.muscleGroups.join(' & ')}</p>`;
            } else {
                infoHtml += `<p>Dia de treino. Defina os grupos musculares clicando em ✏️ na agenda.</p>`;
            }
            
            exerciseListContainer.innerHTML = `
                <h5>Exercícios Planejados:</h5>
                ${template.exercises.length === 0 ? '<p>Nenhum exercício adicionado a este modelo ainda. Clique em "Adicionar Exercício ao Modelo".</p>' : ''}
                <ul>
                    ${template.exercises.map(ex => `
                        <li id="exercise-tpl-${ex.id}">
                            <span>${ex.name} (Padrão: ${ex.defaultLoadKg}kg, ${ex.defaultSets}x${ex.defaultReps})</span>
                            <div>
                                <button class="edit-template-exercise-btn icon-btn" data-exercise-id="${ex.id}" aria-label="Editar exercício ${ex.name} no modelo" title="Editar Exercício">✏️</button>
                                <button class="delete-template-exercise-btn icon-btn" data-exercise-id="${ex.id}" aria-label="Excluir exercício ${ex.name} do modelo" title="Excluir Exercício">🗑️</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            `;
            addExerciseBtn.style.display = 'inline-block';
            logWorkoutBtn.style.display = (template.muscleGroups.length > 0) ? 'inline-block' : 'none';

            if (template.muscleGroups.length === 0) {
                 logWorkoutBtn.title = "Defina os grupos musculares para registrar o treino.";
            } else {
                 logWorkoutBtn.title = "Registrar Treino Realizado";
            }

            document.querySelectorAll('.edit-template-exercise-btn').forEach(btn => 
                btn.addEventListener('click', (e) => handleEditTemplateExercise(e.currentTarget as HTMLElement))
            );
            document.querySelectorAll('.delete-template-exercise-btn').forEach(btn => 
                btn.addEventListener('click', (e) => handleDeleteTemplateExercise(e.currentTarget as HTMLElement))
            );

        } else { // Rest day
            infoHtml += `<p>Dia de descanso.</p>`;
            exerciseListContainer.innerHTML = '';
            addExerciseBtn.style.display = 'none';
            logWorkoutBtn.style.display = 'none';
        }
        selectedDayInfoEl.innerHTML = infoHtml;
    } else { // No day selected
        selectedDayInfoEl.innerHTML = '<p>Selecione um dia na agenda para ver ou editar os exercícios.</p>';
        exerciseListContainer.innerHTML = '';
        addExerciseBtn.style.display = 'none';
        logWorkoutBtn.style.display = 'none';
    }
}

function renderLogWorkoutForm() {
    const formExercisesContainer = document.getElementById('log-form-exercises-container');
    const notesTextarea = document.getElementById('workout-notes') as HTMLTextAreaElement;
    if (!formExercisesContainer || !notesTextarea || !selectedDayKey) return;

    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    if (!template || !template.isWorkoutDay) {
        isLoggingWorkout = false;
        updateViewVisibility();
        alert("Não é possível registrar treino: o dia não é de treino ou não tem grupos musculares definidos.");
        return;
    }

    const today = new Date().toLocaleDateString('pt-BR');
    const logFormHeading = document.querySelector('#log-workout-form-view h2');
    if(logFormHeading) logFormHeading.textContent = `Registrar Treino - ${template.dayName} (${template.muscleGroups.join(' & ') || 'Geral'}) - ${today}`;

    formExercisesContainer.innerHTML = ''; // Clear previous slots
    for (let i = 0; i < MAX_LOG_EXERCISE_SLOTS; i++) {
        const slotHtml = `
            <div class="log-exercise-slot" data-slot-index="${i}">
                <h5>Exercício ${i + 1}</h5>
                <div class="form-group">
                    <label for="log-category-slot${i}">Categoria do Exercício:</label>
                    <select id="log-category-slot${i}" name="log-category-slot${i}" data-slot-index="${i}">
                        <option value="">-- Selecione a Categoria --</option>
                        ${Object.keys(EXERCISE_CATALOG).map(catKey => `<option value="${catKey}">${catKey}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="log-exercise-slot${i}">Exercício:</label>
                    <select id="log-exercise-slot${i}" name="log-exercise-slot${i}" data-slot-index="${i}" disabled>
                        <option value="">-- Selecione a Categoria Primeiro --</option>
                    </select>
                </div>
                <div class="log-exercise-inputs-grid">
                    <div class="form-group">
                        <label for="log-load-slot${i}">Carga (kg):</label>
                        <input type="number" id="log-load-slot${i}" name="log-load-slot${i}" value="0" step="0.25" min="0" disabled>
                    </div>
                    <div class="form-group">
                        <label for="log-sets-slot${i}">Séries:</label>
                        <input type="number" id="log-sets-slot${i}" name="log-sets-slot${i}" value="3" min="1" disabled>
                    </div>
                    <div class="form-group">
                        <label for="log-reps-slot${i}">Repetições:</label>
                        <input type="text" id="log-reps-slot${i}" name="log-reps-slot${i}" value="10" placeholder="Ex: 8-12" disabled>
                    </div>
                </div>
            </div>
        `;
        formExercisesContainer.insertAdjacentHTML('beforeend', slotHtml);
    }
    
    // Add event listeners for new category dropdowns in log form
    for (let i = 0; i < MAX_LOG_EXERCISE_SLOTS; i++) {
        const categorySelect = document.getElementById(`log-category-slot${i}`) as HTMLSelectElement;
        categorySelect.addEventListener('change', () => populateExerciseDropdownForLogSlot(i));
    }

    notesTextarea.value = ''; 
}

function populateExerciseDropdownForLogSlot(slotIndex: number) {
    const categorySelect = document.getElementById(`log-category-slot${slotIndex}`) as HTMLSelectElement;
    const exerciseSelect = document.getElementById(`log-exercise-slot${slotIndex}`) as HTMLSelectElement;
    const loadInput = document.getElementById(`log-load-slot${slotIndex}`) as HTMLInputElement;
    const setsInput = document.getElementById(`log-sets-slot${slotIndex}`) as HTMLInputElement;
    const repsInput = document.getElementById(`log-reps-slot${slotIndex}`) as HTMLInputElement;

    const selectedCategory = categorySelect.value;
    exerciseSelect.innerHTML = '<option value="">-- Selecione o Exercício --</option>'; // Reset

    if (selectedCategory && EXERCISE_CATALOG[selectedCategory]) {
        EXERCISE_CATALOG[selectedCategory].forEach(exItem => {
            exerciseSelect.add(new Option(exItem.name, exItem.id));
        });
        exerciseSelect.disabled = false;
        loadInput.disabled = false;
        setsInput.disabled = false;
        repsInput.disabled = false;
    } else {
        exerciseSelect.disabled = true;
        loadInput.disabled = true;
        setsInput.disabled = true;
        repsInput.disabled = true;
    }
}


function renderLastWorkouts() {
    const container = document.getElementById('last-workouts-container');
    if (!container) return;

    if (workoutHistory.length === 0) {
        container.innerHTML = "<p>Nenhum treino registrado ainda. Comece registrando um!</p>";
        return;
    }
    
    let html = ""; // Removed h4 from here, will be in HTML directly
    let foundAny = false;

    const sortedHistory = [...workoutHistory].sort((a,b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());
    const displayedLogs: WorkoutLog[] = [];

    // Logic to get the last 3 unique workout types or up to 5 logs
    const uniqueMuscleGroupLogs: { [key: string]: WorkoutLog } = {};
    let count = 0;
    for (const log of sortedHistory) {
        if (count >= 5) break;
        const templateForLog = workoutTemplates.find(t => t.dayKey === log.dayKey);
        if (templateForLog && templateForLog.isWorkoutDay && templateForLog.muscleGroups.length > 0) {
            const muscleGroupKey = templateForLog.muscleGroups.join(',');
            if (!uniqueMuscleGroupLogs[muscleGroupKey]) {
                uniqueMuscleGroupLogs[muscleGroupKey] = log;
                displayedLogs.push(log);
                count++;
            } else if (displayedLogs.length < 3 && !displayedLogs.find(dl => dl.id === log.id)) { // Add more if less than 3 displayed, ensure not duplicate
                displayedLogs.push(log);
                count++;
            }
        } else if (displayedLogs.length < 3  && !displayedLogs.find(dl => dl.id === log.id)) { // Add if general workout and less than 3 displayed
             displayedLogs.push(log);
             count++;
        }
    }
     // Final sort by date if we picked non-sequentially
    displayedLogs.sort((a,b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());


    if (displayedLogs.length > 0) {
        foundAny = true;
        html += "<ul>";
        displayedLogs.forEach(log => {
            const template = workoutTemplates.find(t => t.dayKey === log.dayKey);
            const workoutTitle = template ? `${template.dayName} (${template.muscleGroups.join(' & ') || 'Geral'})` : log.dayKey;
            html += `<li>
                <strong>${workoutTitle}</strong> - ${new Date(log.dateISO).toLocaleDateString('pt-BR', {weekday: 'short', day: 'numeric', month: 'short'})}:
                <ul>
                    ${log.loggedExercises.map(ex => `<li>${ex.name}: ${ex.loadKg}kg, ${ex.sets}x${ex.reps}</li>`).join('')}
                </ul>
                ${log.notes ? `<p class="workout-notes"><em>Notas: ${log.notes}</em></p>` : ''}
            </li>`;
        });
        html += "</ul>";
    }
    
    if (!foundAny) {
        container.innerHTML = "<p>Nenhum treino correspondente aos grupos musculares principais encontrado no histórico recente.</p>";
    } else {
        container.innerHTML = html;
    }
}

// --- Modal Logic for Editing Day ---
function handleOpenEditDayModal(dayKey: string | null) {
    if (!dayKey) return;
    editingDayKey = dayKey;
    const template = workoutTemplates.find(d => d.dayKey === editingDayKey);
    if (!template) return;

    const modal = document.getElementById('edit-day-modal') as HTMLElement;
    const dayNameEl = document.getElementById('edit-day-modal-dayname') as HTMLElement;
    const dayKeyInput = document.getElementById('edit-day-modal-daykey') as HTMLInputElement;
    const isWorkoutCheckbox = document.getElementById('edit-day-is-workout') as HTMLInputElement;
    const muscleGroupsContainer = document.getElementById('edit-day-muscle-groups-container') as HTMLElement;
    const muscleGroupsListEl = document.getElementById('edit-day-muscle-groups-list') as HTMLElement;

    dayNameEl.textContent = template.dayName;
    dayKeyInput.value = template.dayKey;
    isWorkoutCheckbox.checked = template.isWorkoutDay;

    muscleGroupsListEl.innerHTML = AVAILABLE_MUSCLE_GROUPS.map(group => `
        <label>
            <input type="checkbox" name="muscle-group" value="${group}" ${template.muscleGroups.includes(group) ? 'checked' : ''}>
            ${group}
        </label>
    `).join('');

    muscleGroupsContainer.style.display = template.isWorkoutDay ? 'block' : 'none';
    modal.style.display = 'flex';
    (isWorkoutCheckbox as HTMLElement).focus();
}

function handleCloseEditDayModal() {
    const modal = document.getElementById('edit-day-modal') as HTMLElement;
    modal.style.display = 'none';
    editingDayKey = null;
}

function handleSaveDayConfiguration(event: Event) {
    event.preventDefault();
    if (!editingDayKey) return;

    const template = workoutTemplates.find(d => d.dayKey === editingDayKey);
    if (!template) return;

    const isWorkoutCheckbox = document.getElementById('edit-day-is-workout') as HTMLInputElement;
    template.isWorkoutDay = isWorkoutCheckbox.checked;

    if (template.isWorkoutDay) {
        const selectedMuscleGroups: string[] = [];
        document.querySelectorAll('#edit-day-muscle-groups-list input[name="muscle-group"]:checked').forEach(checkbox => {
            selectedMuscleGroups.push((checkbox as HTMLInputElement).value);
        });
        template.muscleGroups = selectedMuscleGroups;
    } else {
        template.muscleGroups = []; 
    }

    saveData();
    renderSchedule();
    if (selectedDayKey === editingDayKey) { 
        renderSelectedDayDetails();
    }
    handleCloseEditDayModal();
}


// --- Event Handlers & Logic ---

function handleDaySelection(dayKey: string | null) {
    if (!dayKey) return;
    selectedDayKey = dayKey;
    isLoggingWorkout = false; 
    renderSchedule(); 
    updateViewVisibility();
}

function updateViewVisibility() {
    const detailsView = document.getElementById('workout-details-view');
    const logFormView = document.getElementById('log-workout-form-view');

    if (!detailsView || !logFormView) return;

    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);

    if (isLoggingWorkout && template && template.isWorkoutDay) { 
        detailsView.style.display = 'none';
        logFormView.style.display = 'block';
        renderLogWorkoutForm(); 
        (logFormView.querySelector('select, input, textarea') as HTMLElement)?.focus();
    } else {
        detailsView.style.display = 'block';
        logFormView.style.display = 'none';
        renderSelectedDayDetails(); 
    }
}

// --- Add Exercise to Template Modal Logic ---
function handleOpenAddExerciseModal() {
    if (!selectedDayKey) return;
    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    if (!template || !template.isWorkoutDay) {
        alert("Selecione um dia de treino para adicionar exercícios.");
        return;
    }

    const modal = document.getElementById('add-exercise-modal') as HTMLElement;
    const categorySelect = document.getElementById('add-exercise-category-select') as HTMLSelectElement;
    const exerciseSelect = document.getElementById('add-exercise-item-select') as HTMLSelectElement;
    const defaultLoadInput = document.getElementById('add-exercise-default-load') as HTMLInputElement;
    const defaultSetsInput = document.getElementById('add-exercise-default-sets') as HTMLInputElement;
    const defaultRepsInput = document.getElementById('add-exercise-default-reps') as HTMLInputElement;


    categorySelect.innerHTML = '<option value="">-- Selecione a Categoria --</option>';
    Object.keys(EXERCISE_CATALOG).forEach(catKey => {
        categorySelect.add(new Option(catKey, catKey));
    });

    exerciseSelect.innerHTML = '<option value="">-- Selecione o Exercício --</option>';
    exerciseSelect.disabled = true;
    
    (document.getElementById('add-exercise-form') as HTMLFormElement).reset();
    defaultLoadInput.value = "0";
    defaultSetsInput.value = "3";
    defaultRepsInput.value = "10";


    modal.style.display = 'flex';
    categorySelect.focus();
}

function handleCloseAddExerciseModal() {
    const modal = document.getElementById('add-exercise-modal') as HTMLElement;
    modal.style.display = 'none';
}

function populateExerciseItemDropdownForTemplateModal() {
    const categorySelect = document.getElementById('add-exercise-category-select') as HTMLSelectElement;
    const exerciseSelect = document.getElementById('add-exercise-item-select') as HTMLSelectElement;
    const selectedCategory = categorySelect.value;

    exerciseSelect.innerHTML = '<option value="">-- Selecione o Exercício --</option>';
    if (selectedCategory && EXERCISE_CATALOG[selectedCategory]) {
        EXERCISE_CATALOG[selectedCategory].forEach(exItem => {
            exerciseSelect.add(new Option(exItem.name, exItem.id));
        });
        exerciseSelect.disabled = false;
    } else {
        exerciseSelect.disabled = true;
    }
}

function handleSaveTemplateExercise(event: Event) {
    event.preventDefault();
    if (!selectedDayKey) return;
    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    if (!template) return;

    const form = event.target as HTMLFormElement;
    const categoryKey = (form.elements.namedItem('add-exercise-category') as HTMLSelectElement).value;
    const exerciseItemKey = (form.elements.namedItem('add-exercise-item') as HTMLSelectElement).value;
    const defaultLoadKg = parseFloat((form.elements.namedItem('add-exercise-default-load') as HTMLInputElement).value);
    const defaultSets = parseInt((form.elements.namedItem('add-exercise-default-sets') as HTMLInputElement).value, 10);
    const defaultReps = (form.elements.namedItem('add-exercise-default-reps') as HTMLInputElement).value.trim();

    if (!categoryKey || !exerciseItemKey || isNaN(defaultLoadKg) || isNaN(defaultSets) || defaultReps === "") {
        alert("Por favor, preencha todos os campos obrigatórios com valores válidos.");
        return;
    }

    const exerciseName = EXERCISE_CATALOG[categoryKey]?.find(ex => ex.id === exerciseItemKey)?.name;
    if (!exerciseName) {
        alert("Exercício selecionado inválido.");
        return;
    }

    const newExercise: Exercise = {
        id: uuidv4(),
        categoryKey,
        exerciseItemKey,
        name: exerciseName,
        defaultLoadKg: Math.max(0, defaultLoadKg),
        defaultSets: Math.max(1, defaultSets),
        defaultReps,
    };
    template.exercises.push(newExercise);
    saveData();
    renderSelectedDayDetails();
    handleCloseAddExerciseModal();
}


function handleEditTemplateExercise(buttonElement: HTMLElement) {
    const exerciseId = buttonElement.dataset.exerciseId;
    if (!selectedDayKey || !exerciseId) return;

    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    const exercise = template?.exercises.find(ex => ex.id === exerciseId);
    if (!template || !exercise) return;

    const newLoadStr = prompt(`Nova carga padrão para ${exercise.name} (kg):`, exercise.defaultLoadKg.toString());
    if (newLoadStr === null) return;
    const newLoad = parseFloat(newLoadStr);

    const newSetsStr = prompt(`Novas séries padrão para ${exercise.name}:`, exercise.defaultSets.toString());
    if (newSetsStr === null) return;
    const newSets = parseInt(newSetsStr, 10);

    const newReps = prompt(`Novas repetições padrão para ${exercise.name} (ex: 8-12):`, exercise.defaultReps);
    if (newReps === null) return;

    if (isNaN(newLoad) || isNaN(newSets) || newReps.trim() === "") {
        alert("Valores inválidos. Repetições não pode ser vazio, carga e séries devem ser números.");
        return;
    }
    
    exercise.defaultLoadKg = Math.max(0, newLoad);
    exercise.defaultSets = Math.max(1, newSets);
    exercise.defaultReps = newReps.trim();

    saveData();
    renderSelectedDayDetails();
}

function handleDeleteTemplateExercise(buttonElement: HTMLElement) {
    const exerciseId = buttonElement.dataset.exerciseId;
    if (!selectedDayKey || !exerciseId) return;
    
    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    const exercise = template?.exercises.find(ex => ex.id === exerciseId);
    if (!template || !exercise) return;

    if (!confirm(`Tem certeza que deseja excluir o exercício "${exercise.name}" do modelo de ${template.dayName}?`)) return;

    template.exercises = template.exercises.filter(ex => ex.id !== exerciseId);
    saveData();
    renderSelectedDayDetails();
}

function handleSaveWorkoutLog(event: Event) {
    event.preventDefault();
    if (!selectedDayKey) return;

    const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
    if (!template || !template.isWorkoutDay || template.muscleGroups.length === 0) {
        alert("Não é possível salvar: verifique se o dia é de treino e possui grupos musculares definidos.");
        return;
    }

    const loggedExercises: LoggedExerciseData[] = [];
    const form = event.target as HTMLFormElement;
    
    for (let i = 0; i < MAX_LOG_EXERCISE_SLOTS; i++) {
        const categorySelect = form.querySelector(`#log-category-slot${i}`) as HTMLSelectElement;
        const exerciseSelect = form.querySelector(`#log-exercise-slot${i}`) as HTMLSelectElement;
        const loadInput = form.querySelector(`#log-load-slot${i}`) as HTMLInputElement;
        const setsInput = form.querySelector(`#log-sets-slot${i}`) as HTMLInputElement;
        const repsInput = form.querySelector(`#log-reps-slot${i}`) as HTMLInputElement;

        const categoryKey = categorySelect.value;
        const exerciseItemKey = exerciseSelect.value;

        if (categoryKey && exerciseItemKey) { 
            const exerciseName = EXERCISE_CATALOG[categoryKey]?.find(ex => ex.id === exerciseItemKey)?.name;
            if (!exerciseName) {
                alert(`Exercício inválido selecionado no slot ${i + 1}.`);
                return; 
            }

            const loadKg = parseFloat(loadInput.value);
            const sets = parseInt(setsInput.value, 10);
            const reps = repsInput.value.trim();

            if (isNaN(loadKg) || loadKg < 0 || isNaN(sets) || sets < 1 || reps === "") {
                alert(`Por favor, preencha corretamente os campos para o exercício "${exerciseName}" no slot ${i + 1}. Carga e séries devem ser números válidos e repetições não pode ser vazio.`);
                (loadInput.checkValidity() ? (setsInput.checkValidity() ? repsInput : setsInput) : loadInput).focus();
                return; 
            }

            loggedExercises.push({
                categoryKey,
                exerciseItemKey,
                name: exerciseName,
                loadKg,
                sets,
                reps,
            });
        }
    }

    if (loggedExercises.length === 0) {
        alert("Nenhum exercício foi registrado. Adicione pelo menos um exercício ao log.");
        return;
    }

    const notesTextarea = form.querySelector('#workout-notes') as HTMLTextAreaElement;
    const notes = notesTextarea.value.trim();

    const newLog: WorkoutLog = {
        id: uuidv4(),
        dateISO: new Date().toISOString(),
        dayKey: selectedDayKey,
        loggedExercises,
        notes,
    };

    workoutHistory.push(newLog);
    saveData();
    alert("Treino salvo com sucesso!");

    isLoggingWorkout = false;
    updateViewVisibility();
    renderLastWorkouts(); 
}


// --- Body Measurements ---
function renderBodyMeasurementsSection() {
    const container = document.getElementById('body-measurements-history-container');
    if (!container) return;

    if (bodyMeasurementHistory.length === 0) {
        container.innerHTML = "<p>Nenhuma medida corporal registrada ainda.</p>";
        return;
    }

    const sortedHistory = [...bodyMeasurementHistory].sort((a, b) => new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime());

    container.innerHTML = `
        <ul>
            ${sortedHistory.map(log => `
                <li class="measurement-log-item" id="bm-log-${log.id}">
                    <div class="log-item-header">
                        <strong>${new Date(log.dateISO).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                        <div>
                            <button class="edit-body-measurement-btn icon-btn" data-log-id="${log.id}" aria-label="Editar medidas de ${new Date(log.dateISO).toLocaleDateString('pt-BR')}" title="Editar Medidas">✏️</button>
                            <button class="delete-body-measurement-btn icon-btn" data-log-id="${log.id}" aria-label="Excluir medidas de ${new Date(log.dateISO).toLocaleDateString('pt-BR')}" title="Excluir Medidas">🗑️</button>
                        </div>
                    </div>
                    <div class="measurement-log-item-details">
                        ${AVAILABLE_BODY_MEASUREMENTS.map(def => 
                            log.measurements[def.key] !== undefined && log.measurements[def.key] !== null && log.measurements[def.key] !== ''
                            ? `<p><span>${def.name}:</span> ${log.measurements[def.key]} ${def.unit}</p>`
                            : ''
                        ).join('')}
                    </div>
                    ${log.notes ? `<p class="workout-notes"><em>Notas: ${log.notes}</em></p>` : ''}
                </li>
            `).join('')}
        </ul>
    `;
    
    document.querySelectorAll('.edit-body-measurement-btn').forEach(btn => 
        btn.addEventListener('click', (e) => handleEditBodyMeasurement((e.currentTarget as HTMLElement).dataset.logId!))
    );
    document.querySelectorAll('.delete-body-measurement-btn').forEach(btn => 
        btn.addEventListener('click', (e) => handleDeleteBodyMeasurement((e.currentTarget as HTMLElement).dataset.logId!))
    );
}

function handleOpenBodyMeasurementModal(logIdToEdit?: string) {
    editingBodyMeasurementLogId = logIdToEdit || null;
    const modal = document.getElementById('body-measurement-modal') as HTMLElement;
    const form = document.getElementById('body-measurement-form') as HTMLFormElement;
    const title = document.getElementById('body-measurement-modal-title') as HTMLElement;
    const dateInput = document.getElementById('body-measurement-date') as HTMLInputElement;
    const notesInput = document.getElementById('body-measurement-notes') as HTMLTextAreaElement;
    const fieldsContainer = document.getElementById('body-measurement-fields-container') as HTMLElement;
    const logIdInput = document.getElementById('body-measurement-log-id') as HTMLInputElement;

    form.reset();
    fieldsContainer.innerHTML = ''; // Clear previous fields

    AVAILABLE_BODY_MEASUREMENTS.forEach(def => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.htmlFor = `bm-${def.key}`;
        label.textContent = `${def.name}${def.unit ? ` (${def.unit})` : ''}:`;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.id = `bm-${def.key}`;
        input.name = def.key;
        input.step = def.step || 'any';
        input.min = "0";
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        fieldsContainer.appendChild(formGroup);
    });

    if (editingBodyMeasurementLogId) {
        const logEntry = bodyMeasurementHistory.find(log => log.id === editingBodyMeasurementLogId);
        if (logEntry) {
            title.textContent = "Editar Medidas Corporais";
            logIdInput.value = logEntry.id;
            dateInput.value = logEntry.dateISO.substring(0,10); // Format YYYY-MM-DD for date input
            notesInput.value = logEntry.notes;
            AVAILABLE_BODY_MEASUREMENTS.forEach(def => {
                const input = document.getElementById(`bm-${def.key}`) as HTMLInputElement;
                if (input && logEntry.measurements[def.key] !== undefined) {
                    input.value = logEntry.measurements[def.key].toString();
                }
            });
        } else {
            editingBodyMeasurementLogId = null; // Entry not found, treat as new
            title.textContent = "Registrar Novas Medidas Corporais";
            logIdInput.value = "";
            dateInput.value = getTodayISOString();
        }
    } else {
        title.textContent = "Registrar Novas Medidas Corporais";
        logIdInput.value = "";
        dateInput.value = getTodayISOString();
    }
    modal.style.display = 'flex';
    dateInput.focus();
}

function handleCloseBodyMeasurementModal() {
    const modal = document.getElementById('body-measurement-modal') as HTMLElement;
    modal.style.display = 'none';
    editingBodyMeasurementLogId = null;
}

function handleSaveBodyMeasurementLog(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const logId = (form.elements.namedItem('body-measurement-log-id') as HTMLInputElement).value;
    const dateISO = (form.elements.namedItem('body-measurement-date') as HTMLInputElement).value;
    const notes = (form.elements.namedItem('body-measurement-notes') as HTMLTextAreaElement).value.trim();

    if (!dateISO) {
        alert("Por favor, selecione uma data.");
        return;
    }

    const measurements: BodyMeasurementValues = {};
    let hasAtLeastOneValue = false;
    AVAILABLE_BODY_MEASUREMENTS.forEach(def => {
        const input = form.elements.namedItem(def.key) as HTMLInputElement;
        if (input.value !== "" && input.value !== null) {
            const val = parseFloat(input.value);
             if (!isNaN(val) && val >= 0) {
                measurements[def.key] = val;
                hasAtLeastOneValue = true;
            } else {
                // Allow empty but not invalid negative numbers for now
                 if (val < 0) {
                     alert(`Valor inválido para ${def.name}. Deve ser um número não negativo.`);
                     input.focus();
                     throw new Error("Invalid measurement value"); // Stop execution
                 }
            }
        }
    });

    if (!hasAtLeastOneValue) {
        alert("Por favor, preencha pelo menos um campo de medida.");
        return;
    }


    if (logId) { // Editing existing log
        const logIndex = bodyMeasurementHistory.findIndex(log => log.id === logId);
        if (logIndex > -1) {
            bodyMeasurementHistory[logIndex].dateISO = dateISO;
            bodyMeasurementHistory[logIndex].measurements = measurements;
            bodyMeasurementHistory[logIndex].notes = notes;
            alert("Medidas atualizadas com sucesso!");
        }
    } else { // New log
        const newLog: BodyMeasurementLogEntry = {
            id: uuidv4(),
            dateISO,
            measurements,
            notes,
        };
        bodyMeasurementHistory.push(newLog);
        alert("Medidas salvas com sucesso!");
    }

    saveData();
    renderBodyMeasurementsSection();
    handleCloseBodyMeasurementModal();
}

function handleEditBodyMeasurement(logId: string) {
    handleOpenBodyMeasurementModal(logId);
}

function handleDeleteBodyMeasurement(logId: string) {
    const logEntry = bodyMeasurementHistory.find(log => log.id === logId);
    if (!logEntry) return;

    if (confirm(`Tem certeza que deseja excluir as medidas registradas em ${new Date(logEntry.dateISO).toLocaleDateString('pt-BR')}?`)) {
        bodyMeasurementHistory = bodyMeasurementHistory.filter(log => log.id !== logId);
        saveData();
        renderBodyMeasurementsSection();
        alert("Registro de medidas excluído.");
    }
}


function setupEventListeners() {
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        renderTheme();
        saveData();
    });

    // Edit Day Modal Listeners
    document.getElementById('edit-day-form')?.addEventListener('submit', handleSaveDayConfiguration);
    document.getElementById('cancel-edit-day-modal-btn')?.addEventListener('click', handleCloseEditDayModal);
    document.getElementById('edit-day-is-workout')?.addEventListener('change', (e) => {
        const muscleGroupsContainer = document.getElementById('edit-day-muscle-groups-container') as HTMLElement;
        muscleGroupsContainer.style.display = (e.target as HTMLInputElement).checked ? 'block' : 'none';
    });

    // Add Exercise to Template Modal Listeners
    document.getElementById('add-exercise-to-template-btn')?.addEventListener('click', handleOpenAddExerciseModal);
    document.getElementById('add-exercise-form')?.addEventListener('submit', handleSaveTemplateExercise);
    document.getElementById('cancel-add-exercise-modal-btn')?.addEventListener('click', handleCloseAddExerciseModal);
    document.getElementById('add-exercise-category-select')?.addEventListener('change', populateExerciseItemDropdownForTemplateModal);
    
    document.getElementById('log-workout-btn')?.addEventListener('click', () => {
        if (!selectedDayKey) {
            alert("Por favor, selecione um dia na agenda primeiro.");
            return;
        }
        const template = workoutTemplates.find(d => d.dayKey === selectedDayKey);
        if (template && template.isWorkoutDay) {
            if (template.muscleGroups.length === 0) {
                alert("Defina os grupos musculares para este dia de treino antes de registrar. Clique no ✏️ na agenda.");
                return;
            }
            isLoggingWorkout = true;
            updateViewVisibility();
        } else {
            alert("Este dia não é um dia de treino configurado ou não foi selecionado.");
        }
    });

    document.getElementById('workout-log-form')?.addEventListener('submit', handleSaveWorkoutLog);
    document.getElementById('cancel-log-workout-btn')?.addEventListener('click', () => {
        if (confirm("Cancelar registro de treino? As informações não salvas serão perdidas.")) {
            isLoggingWorkout = false;
            updateViewVisibility();
        }
    });

    document.getElementById('fab-add-workout')?.addEventListener('click', () => {
        const today = new Date();
        const dayIndex = (today.getDay() + 6) % 7; 
        const currentDayKey = workoutTemplates[dayIndex]?.dayKey;
        const currentDayTemplate = workoutTemplates.find(d => d.dayKey === currentDayKey);

        if (currentDayTemplate && currentDayTemplate.isWorkoutDay) {
            if (currentDayTemplate.muscleGroups.length === 0) {
                alert(`O treino de hoje (${currentDayTemplate.dayName}) não tem grupos musculares definidos. Selecione o dia na agenda e clique em ✏️ para configurar.`);
                selectedDayKey = currentDayKey;
                isLoggingWorkout = false;
                renderSchedule();
                updateViewVisibility(); 
                return;
            }
            selectedDayKey = currentDayKey;
            isLoggingWorkout = true;
            renderSchedule(); 
            updateViewVisibility(); 
        } else {
            alert("Hoje não é um dia de treino configurado. Selecione um dia na agenda ou configure o dia de hoje (usando ✏️) como um dia de treino.");
        }
    });

    // Body Measurements Listeners
    document.getElementById('add-body-measurement-btn')?.addEventListener('click', () => handleOpenBodyMeasurementModal());
    document.getElementById('body-measurement-form')?.addEventListener('submit', handleSaveBodyMeasurementLog);
    document.getElementById('cancel-body-measurement-modal-btn')?.addEventListener('click', handleCloseBodyMeasurementModal);
}

// --- PWA Service Worker Registration ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (document.readyState !== 'complete') {
                    console.warn('ServiceWorker registration: Document not complete even after load and delay. Aborting registration attempt.');
                    return;
                }
                if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname.startsWith('127.'))) {
                    console.warn('ServiceWorker registration: Requires HTTPS or localhost. Aborting registration attempt.');
                    return;
                }
                try {
                    const swUrl = new URL('sw.js', location.href); 
                    navigator.serviceWorker.register(swUrl.toString(), { scope: '/' }) 
                        .then(registration => {
                            console.log('ServiceWorker registration successful. Scope:', registration.scope, 'Registered URL:', swUrl.toString());
                        })
                        .catch(error => {
                            console.error('ServiceWorker registration failed during .register() call.');
                            console.error('Error Name:', error.name); 
                            console.error('Error Message:', error.message);
                            console.error('Attempted SW URL:', swUrl.toString());
                            console.error('Document Origin:', location.origin);
                            console.error('Document ReadyState:', document.readyState);
                        });
                } catch (e) {
                    console.error('Error constructing SW URL or during registration attempt preparation:', e);
                }
            }, 300); 
        });
    } else {
        console.warn('ServiceWorker API not available in this browser.');
    }
}

// --- App Initialization ---
function initializeApp() {
    loadData(); 
    renderTheme();
    renderSchedule();
    renderSelectedDayDetails(); 
    renderLastWorkouts();
    renderBodyMeasurementsSection(); // Render new section
    setupEventListeners();
    updateViewVisibility(); 
    registerServiceWorker(); 
}

document.addEventListener('DOMContentLoaded', initializeApp);

console.log("DidiFit App Loaded.");