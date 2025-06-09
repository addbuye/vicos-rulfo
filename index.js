import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { runFlow } from '@genkit-ai/flow';
import { summarizePageFlow, answerQuestionFlow, composeFlow, editFlow } from './src/llmService.js';
import { validateToken } from "./src/firebaseService.js";

// Verify required environment variables
const requiredEnvVars = [
    'GOOGLE_PROJECT_ID',
    'PUBLIC_API_KEY',
    'PUBLIC_APP_ID',
    'GOOGLE_PRIVATE_KEY_ID',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_GENAI_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    process.exit(1);
}

// Log successful configuration
console.log('Environment configuration loaded successfully');
console.log('Project ID:', process.env.GOOGLE_PROJECT_ID);
console.log('Server will run on port:', process.env.PORT || 8080);

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure MIME types
app.use((req, res, next) => {
    if (req.path.endsWith('.css')) {
        res.type('text/css');
    } else if (req.path.endsWith('.js')) {
        res.type('application/javascript');
    }
    next();
});

// Servir archivos estáticos
app.use(express.static('public'));

// Rutas que no requieren autenticación
const publicRoutes = ['/', '/favicon.ico', '/config'];

const getParam = (req, paramName, bodyName = paramName) => {
    return req.query[paramName] || (req.body && req.body[bodyName]);
};

const validateFirestoreToken = async (req, res, next) => {
    // Permitir acceso a rutas públicas
    if (publicRoutes.includes(req.path)) {
        return next();
    }

    // Solo validar token en rutas de la API
    if (!req.path.startsWith('/summarize') && 
        !req.path.startsWith('/ask') && 
        !req.path.startsWith('/compose') && 
        !req.path.startsWith('/edit')) {
        return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Intento de acceso sin token o con formato incorrecto.');
        return res.status(401).send({ error: 'No autorizado. Token no proporcionado o con formato incorrecto.' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
        console.warn('Intento de acceso con token vacío después de "Bearer ".');
        return res.status(401).send({ error: 'No autorizado. El token está vacío.' });
    }

    try {
        req.user = await validateToken(token);
        next();
    } catch (error) {
        console.error('Error validando token:', error);
        return res.status(401).send({ error: error.message || 'Error validando token.' });
    }
};

// Ruta raíz
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: './public' });
});

// Endpoint para obtener la configuración de Firebase
app.get('/config', (req, res) => {
    const firebaseConfig = {
        apiKey: process.env.PUBLIC_API_KEY,
        authDomain: `${process.env.GOOGLE_PROJECT_ID}.firebaseapp.com`,
        projectId: process.env.GOOGLE_PROJECT_ID,
        storageBucket: `${process.env.GOOGLE_PROJECT_ID}.appspot.com`,
        appId: process.env.PUBLIC_APP_ID
    };

    console.log('Sending Firebase config:', {
        apiKey: firebaseConfig.apiKey ? 'Present' : 'Missing',
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        appId: firebaseConfig.appId ? 'Present' : 'Missing'
    });

    res.json({ firebaseConfig });
});

app.use(validateFirestoreToken);

app.all('/summarize', async (req, res, next) => { // Usamos .all para aceptar GET o POST
    try {
        const pageId = getParam(req, 'pageId');
        if (!pageId) {
            return res.status(400).send({ error: 'El parámetro pageId es requerido.' });
        }

        const result = await runFlow(summarizePageFlow, { pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /summarize:', error);
        // Pasamos el error al manejador de errores global de Express
        next(error);
    }
});

app.all('/ask', async (req, res, next) => {
    try {
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const result = await runFlow(answerQuestionFlow, { question, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /ask:', error);
        next(error);
    }
});

app.all('/compose', async (req, res, next) => {
    try {
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const pageId = getParam(req, 'page_id', 'page_id') || null;

        const result = await runFlow(composeFlow, { question, pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /compose:', error);
        next(error);
    }
});

app.all('/edit', async (req, res, next) => {
    try {
        console.log(req)
        const question = getParam(req, 'question');
        if (!question) {
            return res.status(400).send({ error: 'El parámetro question es requerido.' });
        }

        const pageId = getParam(req, 'page_id', 'page_id');
        if (!pageId) {
            return res.status(400).send({ error: 'El parámetro page_id es requerido.' });
        }

        const result = await runFlow(editFlow, { question, pageId, uid: req.user.uid });
        res.status(200).send(result);
    } catch (error) {
        console.error('Error en POST /edit:', error);
        next(error);
    }
});

app.use((err, req, res, next) => {
    console.error('Error no manejado:', err.stack || err);
    res.status(500).send({
        error: 'Error interno del servidor al procesar la solicitud.',
        details: err.message || 'Ocurrió un error desconocido.'
    });
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});