'use strict';

const firebase = require('firebase-admin');
const SERVICE_ACCOUNT = require('../resources/' + 'firebase-credentials.json');

firebase.initializeApp({
  credential: firebase.credential.cert(SERVICE_ACCOUNT),
  databaseURL: 'https://rbm-boot-camp-17.firebaseio.com',
});


/**
 * userExists - Check if a user exists
 *
 * @param  {string} conversationId The Conversation ID
 * @return {Promise} Resolves with whether user exists
 */
async function getUser(conversationId) {
  return new Promise((resolve, reject) => {
      const db = firebase.database();
      const ref = db.ref(`users/${conversationId}`);
      ref.once('value', (snapshot) => {
        let data = snapshot.val();
        if (data === undefined || data === null) {
          resolve(false);
        } else {
          resolve(data);
        }
      });
  });
}


/**
 * setPetType - Set the pet of a user
 *
 * @param {string} petKey The pet key
 * @param  {string} conversationId The conversation ID
 * @return {Promise} Resolves if successful
 */
async function setPetType(petKey, conversationId) {
  return new Promise((resolve, reject) => {
      const db = firebase.database();
      const ref = db.ref(`users/${conversationId}`);
      ref.once('value', (snapshot) => {
        ref.set({
          petType: petKey,
        }, () => {
          resolve();
        });
      });
  });
}

module.exports = {
  getUser,
  setPetType,
};
