// ============================================================
//  DATOS DE ESTUDIANTES Y NOTAS
// ============================================================

const USERS = {
  alumno01: { password: "1234", studentId: "s1" },
  alumno02: { password: "1234", studentId: "s2" },
};

const STUDENTS = {
  s1: {
    name: "Valentina Rojas",
    grade: "4° Año Medio A",
    avatar: "V",
    rut: "21.345.678-9",
  },
  s2: {
    name: "Matías González",
    grade: "3° Año Medio B",
    avatar: "M",
    rut: "21.987.654-3",
  },
};

// Estructura de notas por semestre
// Cada evaluación tiene: nombre, porcentaje (peso), nota
const GRADES = {
  s1: {
    1: [
      {
        subject: "Matemáticas",
        teacher: "Prof. Andrés Fuentes",
        evaluations: [
          { name: "Prueba 1 – Álgebra",        type: "prueba",    percentage: 20, grade: 5.8 },
          { name: "Prueba 2 – Ecuaciones",      type: "prueba",    percentage: 20, grade: 6.2 },
          { name: "Control 1",                  type: "control",   percentage: 10, grade: 5.5 },
          { name: "Control 2",                  type: "control",   percentage: 10, grade: 6.0 },
          { name: "Trabajo Grupal",             type: "trabajo",   percentage: 15, grade: 6.5 },
          { name: "Examen Semestral",           type: "examen",    percentage: 25, grade: 5.9 },
        ],
      },
      {
        subject: "Lenguaje y Comunicación",
        teacher: "Prof. Carolina Vega",
        evaluations: [
          { name: "Prueba Comprensión Lectora", type: "prueba",    percentage: 25, grade: 6.0 },
          { name: "Ensayo Argumentativo",       type: "trabajo",   percentage: 20, grade: 6.4 },
          { name: "Control Ortografía",         type: "control",   percentage: 10, grade: 5.8 },
          { name: "Disertación Oral",           type: "trabajo",   percentage: 20, grade: 6.7 },
          { name: "Examen Semestral",           type: "examen",    percentage: 25, grade: 6.1 },
        ],
      },
      {
        subject: "Historia y Cs. Sociales",
        teacher: "Prof. Roberto Muñoz",
        evaluations: [
          { name: "Prueba 1 – República",       type: "prueba",    percentage: 30, grade: 5.2 },
          { name: "Mapa Conceptual",            type: "trabajo",   percentage: 15, grade: 5.8 },
          { name: "Control 1",                  type: "control",   percentage: 10, grade: 4.8 },
          { name: "Debate Histórico",           type: "trabajo",   percentage: 20, grade: 5.5 },
          { name: "Examen Semestral",           type: "examen",    percentage: 25, grade: 5.0 },
        ],
      },
      {
        subject: "Ciencias Naturales",
        teacher: "Prof. Daniela Torres",
        evaluations: [
          { name: "Prueba 1 – Célula",          type: "prueba",    percentage: 25, grade: 6.3 },
          { name: "Informe de Laboratorio",     type: "trabajo",   percentage: 20, grade: 6.8 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 6.0 },
          { name: "Prueba 2 – Genética",        type: "prueba",    percentage: 20, grade: 5.9 },
          { name: "Examen Semestral",           type: "examen",    percentage: 25, grade: 6.5 },
        ],
      },
      {
        subject: "Inglés",
        teacher: "Prof. Sandra Williams",
        evaluations: [
          { name: "Listening Test",             type: "prueba",    percentage: 20, grade: 6.5 },
          { name: "Writing Task",               type: "trabajo",   percentage: 25, grade: 6.8 },
          { name: "Vocabulary Control",         type: "control",   percentage: 10, grade: 6.2 },
          { name: "Speaking Presentation",      type: "trabajo",   percentage: 20, grade: 7.0 },
          { name: "Final Exam",                 type: "examen",    percentage: 25, grade: 6.6 },
        ],
      },
      {
        subject: "Educación Física",
        teacher: "Prof. Luis Campos",
        evaluations: [
          { name: "Test Físico 1",              type: "prueba",    percentage: 30, grade: 6.0 },
          { name: "Proyecto Deportivo",         type: "trabajo",   percentage: 30, grade: 6.5 },
          { name: "Test Físico 2",              type: "prueba",    percentage: 40, grade: 6.2 },
        ],
      },
    ],
    2: [
      {
        subject: "Matemáticas",
        teacher: "Prof. Andrés Fuentes",
        evaluations: [
          { name: "Prueba 1 – Funciones",       type: "prueba",    percentage: 20, grade: 6.0 },
          { name: "Prueba 2 – Trigonometría",   type: "prueba",    percentage: 20, grade: 5.5 },
          { name: "Control 1",                  type: "control",   percentage: 10, grade: 6.3 },
          { name: "Control 2",                  type: "control",   percentage: 10, grade: 5.8 },
          { name: "Proyecto Matemático",        type: "trabajo",   percentage: 15, grade: 6.7 },
          { name: "Examen Final",               type: "examen",    percentage: 25, grade: 5.7 },
        ],
      },
      {
        subject: "Lenguaje y Comunicación",
        teacher: "Prof. Carolina Vega",
        evaluations: [
          { name: "Análisis Literario",         type: "trabajo",   percentage: 25, grade: 6.2 },
          { name: "Prueba Literatura",          type: "prueba",    percentage: 25, grade: 5.9 },
          { name: "Control Gramática",          type: "control",   percentage: 10, grade: 6.0 },
          { name: "Proyecto Comunicacional",    type: "trabajo",   percentage: 15, grade: 6.8 },
          { name: "Examen Final",               type: "examen",    percentage: 25, grade: 6.3 },
        ],
      },
      {
        subject: "Historia y Cs. Sociales",
        teacher: "Prof. Roberto Muñoz",
        evaluations: [
          { name: "Prueba – S. XX",             type: "prueba",    percentage: 30, grade: 5.5 },
          { name: "Investigación Histórica",    type: "trabajo",   percentage: 25, grade: 5.7 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 5.0 },
          { name: "Examen Final",               type: "examen",    percentage: 35, grade: 5.3 },
        ],
      },
      {
        subject: "Ciencias Naturales",
        teacher: "Prof. Daniela Torres",
        evaluations: [
          { name: "Prueba – Evolución",         type: "prueba",    percentage: 25, grade: 6.5 },
          { name: "Informe de Investigación",   type: "trabajo",   percentage: 25, grade: 6.9 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 6.4 },
          { name: "Prueba – Ecología",          type: "prueba",    percentage: 15, grade: 6.7 },
          { name: "Examen Final",               type: "examen",    percentage: 25, grade: 6.6 },
        ],
      },
      {
        subject: "Inglés",
        teacher: "Prof. Sandra Williams",
        evaluations: [
          { name: "Reading Comprehension",      type: "prueba",    percentage: 25, grade: 6.4 },
          { name: "Grammar Test",               type: "prueba",    percentage: 20, grade: 6.0 },
          { name: "Project Presentation",       type: "trabajo",   percentage: 30, grade: 6.9 },
          { name: "Final Exam",                 type: "examen",    percentage: 25, grade: 6.5 },
        ],
      },
      {
        subject: "Educación Física",
        teacher: "Prof. Luis Campos",
        evaluations: [
          { name: "Test Físico 3",              type: "prueba",    percentage: 35, grade: 6.3 },
          { name: "Proyecto Final Deportivo",   type: "trabajo",   percentage: 35, grade: 6.7 },
          { name: "Test Físico 4",              type: "prueba",    percentage: 30, grade: 6.5 },
        ],
      },
    ],
  },

  s2: {
    1: [
      {
        subject: "Matemáticas",
        teacher: "Prof. Patricia Soto",
        evaluations: [
          { name: "Prueba 1 – Números",         type: "prueba",    percentage: 25, grade: 4.8 },
          { name: "Control 1",                  type: "control",   percentage: 10, grade: 5.2 },
          { name: "Prueba 2 – Geometría",       type: "prueba",    percentage: 25, grade: 5.0 },
          { name: "Tarea Grupal",               type: "trabajo",   percentage: 15, grade: 5.5 },
          { name: "Examen Semestral",           type: "examen",    percentage: 25, grade: 4.5 },
        ],
      },
      {
        subject: "Lenguaje",
        teacher: "Prof. Marco Díaz",
        evaluations: [
          { name: "Prueba Lectura",             type: "prueba",    percentage: 30, grade: 5.5 },
          { name: "Redacción",                  type: "trabajo",   percentage: 25, grade: 5.8 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 5.3 },
          { name: "Examen Semestral",           type: "examen",    percentage: 35, grade: 5.0 },
        ],
      },
      {
        subject: "Ciencias",
        teacher: "Prof. Valeria Pérez",
        evaluations: [
          { name: "Prueba 1",                   type: "prueba",    percentage: 30, grade: 6.2 },
          { name: "Informe Lab",                type: "trabajo",   percentage: 20, grade: 6.5 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 6.0 },
          { name: "Examen Semestral",           type: "examen",    percentage: 40, grade: 6.3 },
        ],
      },
    ],
    2: [
      {
        subject: "Matemáticas",
        teacher: "Prof. Patricia Soto",
        evaluations: [
          { name: "Prueba 1 – Estadística",     type: "prueba",    percentage: 25, grade: 5.2 },
          { name: "Control 1",                  type: "control",   percentage: 10, grade: 5.5 },
          { name: "Prueba 2 – Probabilidad",    type: "prueba",    percentage: 25, grade: 4.9 },
          { name: "Proyecto",                   type: "trabajo",   percentage: 15, grade: 5.8 },
          { name: "Examen Final",               type: "examen",    percentage: 25, grade: 5.0 },
        ],
      },
      {
        subject: "Lenguaje",
        teacher: "Prof. Marco Díaz",
        evaluations: [
          { name: "Análisis de Texto",          type: "trabajo",   percentage: 30, grade: 5.8 },
          { name: "Prueba Literatura",          type: "prueba",    percentage: 30, grade: 5.4 },
          { name: "Control",                    type: "control",   percentage: 10, grade: 5.6 },
          { name: "Examen Final",               type: "examen",    percentage: 30, grade: 5.2 },
        ],
      },
      {
        subject: "Ciencias",
        teacher: "Prof. Valeria Pérez",
        evaluations: [
          { name: "Prueba – Física",            type: "prueba",    percentage: 30, grade: 6.4 },
          { name: "Proyecto Experimental",      type: "trabajo",   percentage: 25, grade: 6.8 },
          { name: "Examen Final",               type: "examen",    percentage: 45, grade: 6.5 },
        ],
      },
    ],
  },
};

// ASISTENCIA
const ATTENDANCE = {
  s1: {
    1: {
      total: 90,
      present: 82,
      absent: 6,
      late: 2,
      records: [
        { date: "2026-03-02", status: "present" },
        { date: "2026-03-03", status: "present" },
        { date: "2026-03-04", status: "late" },
        { date: "2026-03-05", status: "present" },
        { date: "2026-03-06", status: "present" },
        { date: "2026-03-09", status: "absent" },
        { date: "2026-03-10", status: "present" },
        { date: "2026-03-11", status: "present" },
        { date: "2026-03-12", status: "present" },
        { date: "2026-03-13", status: "absent" },
      ],
    },
  },
  s2: {
    1: {
      total: 90,
      present: 75,
      absent: 10,
      late: 5,
      records: [],
    },
  },
};

// COMUNICADOS
const COMUNICADOS = [
  {
    id: 1,
    title: "Reunión de Apoderados – Abril",
    date: "2026-03-20",
    category: "reunion",
    content:
      "Se cita a los apoderados a reunión general el día viernes 3 de abril a las 19:00 hrs en el gimnasio del establecimiento. Se tratarán temas académicos y convivencia escolar.",
    important: true,
  },
  {
    id: 2,
    title: "Inicio Período de Evaluaciones",
    date: "2026-03-18",
    category: "academico",
    content:
      "A partir del 28 de marzo comenzará el período de evaluaciones del primer semestre. Se solicita a los estudiantes revisar el calendario de pruebas en plataforma.",
    important: true,
  },
  {
    id: 3,
    title: "Olimpiadas Deportivas Intercolegio",
    date: "2026-03-15",
    category: "deporte",
    content:
      "El colegio participará en las Olimpiadas Deportivas Intercolegio el día 12 de abril. Los interesados en representar al colegio deben inscribirse con el Prof. Luis Campos antes del 5 de abril.",
    important: false,
  },
  {
    id: 4,
    title: "Taller de Orientación Vocacional",
    date: "2026-03-12",
    category: "orientacion",
    content:
      "Para los alumnos de 4° Año Medio se realizará un taller de orientación vocacional los días jueves de 14:30 a 16:00 hrs. Participación obligatoria.",
    important: false,
  },
  {
    id: 5,
    title: "Feria del Libro Escolar",
    date: "2026-03-10",
    category: "cultura",
    content:
      "Del 7 al 11 de abril se realizará la Feria del Libro Escolar en el hall principal. Los estudiantes podrán adquirir textos con descuentos especiales.",
    important: false,
  },
];
