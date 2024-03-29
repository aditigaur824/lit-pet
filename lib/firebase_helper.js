'use strict';

const firebase = require('firebase-admin');
const SERVICE_ACCOUNT = require('../resources/' + 'firebase-credentials.json');

firebase.initializeApp({
  credential: firebase.credential.cert(SERVICE_ACCOUNT),
  databaseURL: 'https://rbm-boot-camp-17.firebaseio.com',
});


/**
 * getUsers - Get list of users and information
 *
 * @return {type}  description
 */
async function getUserList() {
  return new Promise((resolve, reject) => {
      const db = firebase.database();
      const ref = db.ref(`users`);
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
          species: petKey,
          room: 'bedroom',
          hygiene: 80,
          hunger: 80,
          happiness: 80,
          name: '',
        }, () => {
          resolve();
        });
      });
  });
}


/**
 * updateStat - Update the hunger/hygiene/happiness of pet
 *
 * @param  {type} conversationId The conversation ID
 * @param  {type} stat           The stat to update (hunger/hygiene/happiness)
 * @param  {type} newVal         The new value
 * @return {Promise}             Resolves when complete
 */
async function updateStat(conversationId, stat, newVal) {
  return new Promise((resolve, reject) => {
      const db = firebase.database();
      const ref = db.ref(`users/${conversationId}`);
      ref.update({[stat]: newVal}, () => {
        resolve();
      });
  });
}

module.exports = {
  getUser,
  setPetType,
  getUserList,
  updateStat,
};
