// Import necessary modules
const express = require('express');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron'); // Moved cron require up for consistency
require('dotenv').config();

// --- Configuration ---
const initialPort = parseInt(process.env.PORT || '10000', 10);
const MAX_PORT_ATTEMPTS = 10;

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const messageThreadId = process.env.TELEGRAM_MESSAGE_THREAD_ID;
const imageUrl = process.env.TELEGRAM_IMAGE_URL;
const dollarApiUrl = process.env.PYDOLARVE_API_URL;
// const cron = require('node-cron'); // Already required above

// --- Bot Initialization ---
let bot;
// Critical Environment Variable Checks
if (!botToken) {
  console.error("❌ CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined in your .env file or environment variables.");
  console.error("   The bot cannot start without the token.");
  process.exit(1);
}
if (!chatId) {
  console.error("❌ CRITICAL ERROR: TELEGRAM_CHAT_ID is not defined in your .env file or environment variables.");
  console.error("   The bot needs a chat ID to send messages.");
  process.exit(1);
}


// Keep warning: Optional but recommended nnnnnnnnnnnnnnn
if (!messageThreadId) {
  console.warn("⚠️  Optional: TELEGRAM_MESSAGE_THREAD_ID is not defined. Messages will be sent to the main chat, not a specific topic/thread.");
}
if (!imageUrl) {
    // Keep warning: Optional but useful
    console.warn("⚠️  Optional: TELEGRAM_IMAGE_URL is not defined. Startup/daily photos will not be sent.");
}
if (!dollarApiUrl) {
    // Keep warning: Optional but useful
    console.warn("⚠️  Optional: PYDOLARVE_API_URL is not defined. Dollar rates cannot be fetched.");
}


try {
  bot = new TelegramBot(botToken);
  console.log("🤖 Telegram Bot initialized."); // Keep: Confirms bot object created
} catch (error) {
  console.error("❌ Failed to initialize Telegram Bot instance.");
  console.error("   Error:", error.message);
  // Make sure the token format is correct and the token is valid.
  process.exit(1);
}

// --- Express App Setup ---
const app = express();

app.get('/', (req, res) => {
  // Use req.socket.localPort which is reliably available after 'listening' event
  // Or keep track of the port found by startServer
  const runningPort = serverInstance ? serverInstance.address().port : 'unknown'; // Need serverInstance accessible
  res.send(`API Telegram Server is running on port ${runningPort}`);
});

let serverInstance = null; // Variable to hold the server instance later

// --- Helper Function to build Telegram options ---
function buildTelegramOptions() {
  const options = {};
  if (messageThreadId) {
    options.message_thread_id = messageThreadId;
  }
  return options;
}

// --- Centralized Telegram Error Handler ---
function handleTelegramError(actionDescription, error) {
    // Keep all console.error logs inside this function - they are essential for debugging
    console.error(`❌ Error ${actionDescription}:`);
    if (error.response && error.response.body) {
        try {
            // Telegram API errors often come as JSON strings in the body
            const errorBody = typeof error.response.body === 'string' ? JSON.parse(error.response.body) : error.response.body;
            console.error(`   Telegram API Error (${errorBody.error_code || 'N/A'}): ${errorBody.description || 'No description'}`);
        } catch (parseError) {
            // If body isn't JSON or parsing fails, log the raw body
            console.error('   Telegram API Error (raw response body):', error.response.body);
        }
    } else if (error.code) { // Network errors, etc.
         console.error(`   Error Code: ${error.code}`);
         console.error(`   Error Message: ${error.message}`);
    } else { // Other types of errors
        console.error('   Error Details:', error.message || error);
    }
    console.error('   (Check BOT_TOKEN, CHAT_ID, Thread ID, bot permissions in chat, network connectivity)');
}


// --- MODIFIED Function to send startup photo WITH rates and date in caption ---
async function sendTelegramStartupPhotoWithRates() {
  if (!imageUrl) {
    // Keep warning: Explains why photo might be missing
    console.warn("⚠️ No se enviará la foto de inicio: TELEGRAM_IMAGE_URL no está definido.");
    return; // Don't proceed if no image URL
  }
  if (!dollarApiUrl) {
    // Keep warning: Explains potential lack of rates
    console.warn("⚠️ No se pueden obtener tasas: PYDOLARVE_API_URL no está definido.");
  }

  let captionText = "⚡️ Bot iniciado y listo."; // Default simple message

  let currentDateVE = '';
  try {
      currentDateVE = new Date().toLocaleString('es-VE', {
          timeZone: 'America/Caracas', // Venezuela Timezone for startup message date
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
      });
      captionText = `🗓️ *Fecha:* ${currentDateVE}\n\n${captionText}`; // Prepend date
  } catch (dateError) {
      console.error("❌ Error al formatear la fecha:", dateError);
      captionText = `[Fecha no disponible]\n\n${captionText}`; // Fallback date
  }


  // --- Try to fetch and format dollar rates ---
  if (dollarApiUrl) {
      try {
        // console.log(`   Fetching rates from: ${dollarApiUrl}`); // Removed: Less verbose
        const response = await axios.get(dollarApiUrl, { timeout: 10000 }); // 10-second timeout

        // Use optional chaining for safer access
        const monitors = response?.data?.monitors;
        const bcvPrice = monitors?.bcv?.price;
        const paraleloPrice = monitors?.enparalelovzla?.price;

        // console.log(`   Raw Rates - BCV: ${bcvPrice}, Paralelo: ${paraleloPrice}`); // Removed: Debug info

        // Explicitly convert to numbers and check if they are valid numbers
        const bcvNum = parseFloat(bcvPrice);
        const paraleloNum = parseFloat(paraleloPrice);

        if (!isNaN(bcvNum) && !isNaN(paraleloNum)) {
          const formattedBcv = bcvNum.toFixed(2);
          const formattedParalelo = paraleloNum.toFixed(2);
          const promedioNum = (bcvNum + paraleloNum) / 2;
          const Promedio = promedioNum.toFixed(2); // Using 'Promedio' as in your code

          // console.log(`   Calculated Average: ${Promedio}`); // Removed: Debug info

          // Construct the caption text with date, rates, and average
          captionText = `🗓️ *Fecha:* ${currentDateVE}\n\n` + // Added Date
                        `*Cotización (VEN 🇻🇪)*\n\n` +
                        `*BCV:* ${formattedBcv} Bs\n` +     // Using flag emojis for clarity
                        `*Paralelo:* ${formattedParalelo} Bs\n` + // Use Bs consistently
                        `*Promedio:* ${Promedio} Bs`;    // Using scale emoji


          // console.log("   Caption formateado con tasas y promedio."); // Removed: Less verbose

        } else {
          // Keep warning: Important if API returns bad data
          console.warn("⚠️ No se pudieron obtener precios válidos de la API (BCV o Paralelo no son números). Usando caption sin tasas específicas.");
          captionText = `🗓️ *Fecha:* ${currentDateVE}\n\n`+
                        `⚠️ No se pudieron obtener las tasas actuales.\n\n⚡️ Bot iniciado y listo.`;
        }

      } catch (apiError) {
        // Keep all error details: Crucial for diagnosing API issues
        console.error("❌ Error al obtener las tasas del dólar de la API:");
        if (apiError.response) {
            // Server responded with a status code outside the 2xx range
            console.error(`   Status: ${apiError.response.status}, Data: ${JSON.stringify(apiError.response.data)}`);
        } else if (apiError.request) {
             // Request was made but no response received (e.g., timeout, network issue)
             console.error('   No response received from API:', apiError.message);
        } else {
            // Something happened in setting up the request
            console.error('   Error en la configuración de Axios:', apiError.message);
        }
        captionText = `🗓️ *Fecha:* ${currentDateVE}\n\n`+
                      `⚠️ Error al obtener las tasas.\n\n⚡️ Bot iniciado y listo.`;
      }
  } else {
      // API URL wasn't defined, captionText already includes date and basic ready status
      captionText += ` (URL de API no configurada)`;
  }

  // --- Send the photo to Telegram ---
  const options = buildTelegramOptions();
  options.parse_mode = 'Markdown'; // Essential for formatting (*, _, etc.)

  try {
    // console.log(`🖼️ Enviando foto de inicio a Chat ID: ${chatId}...`); // Removed: Less verbose

    await bot.sendPhoto(chatId, imageUrl, {
      ...options,
      caption: captionText
    });

    console.log('✅ Foto de inicio con caption enviada exitosamente.'); // Keep: Confirmation

  } catch (telegramError) {
    // Let handleTelegramError log the details
    handleTelegramError("enviando la foto de inicio", telegramError);
    // Optional Fallback: Send a text message if photo fails (e.g., invalid URL, bot blocked)
    try {
       // console.log("   Intentando enviar mensaje de texto como fallback..."); // Removed
        const fallbackOptions = buildTelegramOptions();
        fallbackOptions.parse_mode = 'Markdown';
        // Use captionText which already includes date and status/error info
        await bot.sendMessage(chatId, `⚠️ *Error al enviar foto de inicio.*\n\n${captionText}`, fallbackOptions);
        console.log("   Mensaje de texto de fallback enviado."); // Keep: Fallback confirmation
    } catch (fallbackError) {
        handleTelegramError("enviando mensaje de texto de fallback", fallbackError);
    }
  }
}


// --- Function to send daily update ---
async function sendDailyUpdate() {
  console.log("ℹ️ Iniciando envío de reporte diario..."); // Log start

  if (!imageUrl) {
    console.warn("⚠️ No se enviará la foto diaria: TELEGRAM_IMAGE_URL no está definido.");
    // Optionally send a text-only update if no image URL
    // return sendDailyUpdateTextOnly(); // Example: create a text-only version
    return;
  }

  let captionText = "📊 *Reporte Diario*"; // Default title
  let currentDateTimeUTC3 = ''; // Changed variable name for clarity

  try {
    // Include time in daily report for clarity, using UTC+3 timezone
    currentDateTimeUTC3 = new Date().toLocaleString('es-ES', { // Using es-ES locale for example, adjust if needed
      timeZone: 'Etc/GMT-3', // Use the UTC+3 timezone
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false // Use 24-hour format for UTC offsets often clearer
    });
  } catch (dateError) {
    console.error("❌ Error al formatear la fecha para el reporte diario (UTC+3):", dateError);
    currentDateTimeUTC3 = '[Fecha/Hora no disponible]';
  }

  captionText = `🗓️ *Fecha:* ${currentDateTimeUTC3} (UTC+3)\n\n${captionText}`; // Prepend date/time and specify timezone

  // --- Fetch and format dollar rates (similar to startup) ---
  if (dollarApiUrl) {
    try {
      const response = await axios.get(dollarApiUrl, { timeout: 10000 });
      const monitors = response?.data?.monitors;
      const bcvPrice = monitors?.bcv?.price;
      const paraleloPrice = monitors?.enparalelovzla?.price;

      const bcvNum = parseFloat(bcvPrice);
      const paraleloNum = parseFloat(paraleloPrice);

      if (!isNaN(bcvNum) && !isNaN(paraleloNum)) {
        const formattedBcv = bcvNum.toFixed(2);
        const formattedParalelo = paraleloNum.toFixed(2);
        const promedioNum = (bcvNum + paraleloNum) / 2;
        const Promedio = promedioNum.toFixed(2);

        // Append rate details to the caption
        captionText += `\n\n*Cotización (VEN 🇻🇪)*\n\n` + // Still show VEN rates
                     `*BCV:* ${formattedBcv} Bs\n` +
                     `*Paralelo:* ${formattedParalelo} Bs\n` +
                     `*Promedio:* ${Promedio} Bs`;
      } else {
         console.warn("⚠️ No se pudieron obtener precios válidos de la API para el reporte diario.");
         captionText += `\n\n⚠️ No se pudieron obtener las tasas actuales.`;
      }
    } catch (apiError) {
      // Log error specifically for the daily update context
      console.error("❌ Error al obtener las tasas del dólar para el reporte diario:");
       if (apiError.response) {
            console.error(`   Status: ${apiError.response.status}, Data: ${JSON.stringify(apiError.response.data)}`);
        } else if (apiError.request) {
             console.error('   No response received from API:', apiError.message);
        } else {
            console.error('   Error en la configuración de Axios:', apiError.message);
        }
      captionText += `\n\n⚠️ Error al obtener las tasas actuales.`;
    }
  } else {
      captionText += `\n\n(URL de API no configurada para tasas)`;
  }

  // --- Send the daily photo to Telegram ---
  const options = buildTelegramOptions();
  options.parse_mode = 'Markdown';

  try {
    await bot.sendPhoto(chatId, imageUrl, {
      ...options,
      caption: captionText
    });
    console.log('✅ Reporte diario enviado exitosamente.');
  } catch (error) {
    handleTelegramError("enviando el reporte diario", error);
    // Optional fallback for daily update as well
    try {
        const fallbackOptions = buildTelegramOptions();
        fallbackOptions.parse_mode = 'Markdown';
        await bot.sendMessage(chatId, `⚠️ *Error al enviar foto del reporte diario.*\n\n${captionText}`, fallbackOptions);
        console.log("   Mensaje de texto de fallback para reporte diario enviado.");
    } catch (fallbackError) {
        handleTelegramError("enviando mensaje de texto de fallback para reporte diario", fallbackError);
    }
  }
}


// --- Server Startup Logic with Port Retry ---
function startServer(currentPort) {
  if (currentPort >= initialPort + MAX_PORT_ATTEMPTS) {
    // Keep error: Explains server start failure
    console.error(`❌ Failed to find an available port after trying from ${initialPort} up to ${currentPort - 1}. Exiting.`);
    process.exit(1);
  }

  // Create the server *inside* this function
  const server = http.createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      // Keep warning: Explains port conflict and retry
      console.warn(`⚠️ Port ${currentPort} is already in use. Trying port ${currentPort + 1}...`);
      // Ensure server is closed before retrying (important!)
      server.close(() => {
          // Short delay before trying next port
          setTimeout(() => startServer(currentPort + 1), 200);
      });
    } else {
      // Keep error: Fatal server error
      console.error('❌ Fatal server startup error:', error);
      process.exit(1);
    }
  });

  // The listen call is now correctly inside startServer
  server.listen(currentPort, async () => {
    serverInstance = server; // Store the server instance globally if needed (e.g., for '/')
    const actualPort = server.address().port; // Get the actual port it bound to
    console.log(`✅ Servidor API corriendo en http://localhost:${actualPort}`);

    // Send the initial startup message AFTER the server is confirmed running
    await sendTelegramStartupPhotoWithRates();

    // --- Schedule the daily task HERE ---
    try {
      // Schedule to run every day at 14:00 (2 PM) in UTC+3 timezone
      // Cron string: Minute Hour DayOfMonth Month DayOfWeek
      cron.schedule('0 14 * * *', () => { // Set hour to 14
        // Log with the target timezone for clarity
        // Using toLocaleString with the specific timezone for accurate logging
        console.log(`⏰ [${new Date().toLocaleString('en-GB',{timeZone:'Etc/GMT-3'})}] Ejecutando tarea programada (14:00 UTC+3)...`);
        // Add error handling for the async function within the cron job
        sendDailyUpdate().catch(cronJobError => {
           console.error("❌ Error dentro de la tarea programada (sendDailyUpdate):", cronJobError);
        });
      }, {
        scheduled: true,
        timezone: "Etc/GMT-3" // Set timezone to UTC+3 (Etc/GMT-3)
      });

      // Update the confirmation message
      console.log('⏰ Tarea diaria programada para ejecutarse a las 14:00 (2 PM) UTC+3.');

    } catch (cronError) {
        console.error("❌ Error al programar la tarea diaria con cron:", cronError);
        // Consider if the app should exit if scheduling fails
    }
    // --- End of Cron Scheduling ---

  });

  // No need to return server here unless used elsewhere,
  // but assigning to serverInstance covers the '/' route case.
  // return server;
}


// --- Start the application ---
startServer(initialPort);


// --- Graceful Shutdown Handling ---
function shutdown(signal) {
  console.log(`\n${signal} signal received: closing HTTP server...`);
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('✅ HTTP server closed.');
      // Perform any other cleanup here (e.g., close DB connections)
      process.exit(0); // Exit gracefully
    });

    // Force exit if server doesn't close promptly
    setTimeout(() => {
        console.error("⚠️ Server close timed out, forcing exit.");
        process.exit(1);
    }, 5000); // 5 second timeout

  } else {
    console.log("ℹ️ No active server to close.");
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT (Ctrl+C)'));

// Optional: Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally exit or log more details
  // process.exit(1); // Uncomment to exit on unhandled rejections
});

// Optional: Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Try graceful shutdown, but it might fail if the error is severe
  shutdown('uncaughtException');
  // Force exit after a delay if shutdown doesn't complete
  setTimeout(() => process.exit(1), 2000);
});