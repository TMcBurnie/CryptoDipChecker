/* eslint-disable linebreak-style */
/* eslint-disable max-len */
const functions = require("firebase-functions");
const axios = require("axios");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Mapping of symbols to Coingecko IDs
const COINS = {btc: "bitcoin", eth: "ethereum", morpho: "morpho", drift: "drift-protocol"};
const THRESHOLD = 0.05; // 5 % drop

exports.checkCryptoDips = functions.pubsub
    .schedule("every 60 minutes") // run hourly; adjust as needed
    .timeZone("Europe/Paris")
    .onRun(async () => {
      const token = functions.config().telegram.token;
      const chatId = functions.config().telegram.chat_id;
      const now = new Date();
      const monthKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`; // e.g. "2025-8"

      for (const symbol of Object.keys(COINS)) {
        const id = COINS[symbol];
        // fetch current price from Coingecko (see how the API returns USD price:contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1})
        const resp = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}`);
        const price = resp.data.market_data.current_price.usd;

        // document for this month and coin
        const docRef = db.collection("cryptoHighs").doc(`${monthKey}-${symbol}`);
        const doc = await docRef.get();
        let high = price;
        if (doc.exists) {
          high = doc.data().high;
          if (price > high) {
            // update new high
            await docRef.set({high: price}, {merge: true});
            continue;
          }
          // check for dip
          if (price <= high * (1 - THRESHOLD)) {
            const pct = ((high - price) / high * 100).toFixed(2);
            const text = `Dip alert for ${symbol.toUpperCase()}!\nCurrent price: $${price.toFixed(4)}\nThis is a ${pct}% drop from this month's high of $${high.toFixed(4)}.`;
            await axios.get(`https://api.telegram.org/bot${token}/sendMessage`, {
              params: {
                chat_id: chatId,
                text: text,
              },
            });
            // reset high to current price to prevent repeated alerts
            await docRef.set({high: price}, {merge: true});
          }
        } else {
          // first run for the month
          await docRef.set({high: price});
        }
      }
      return null;
    });
