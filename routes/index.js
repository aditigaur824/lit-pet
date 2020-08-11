// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const path = require('path');
const express = require('express');
const router = express.Router();
const uuid = require('uuid');
const schedule = require('node-schedule');
const firebaseHandler = require('../lib/firebase_helper');
const apiHelper = require('../lib/api_helper');
const pets = require('../resources/pets.json');
const {createCanvas, loadImage} = require('canvas');
const { firebase } = require('googleapis/build/src/apis/firebase');

const COMMAND_START = 'start';
const COMMAND_CHOOSE_PET = 'choosepet';
const COMMAND_FEED_PET = 'feed';
const COMMAND_FOOD_ITEM = 'food';
const COMMAND_PLAY_WITH_PET = 'play';
const COMMAND_CLEAN_PET = 'clean';
const COMMAND_HELP = 'help';

/**
 * Image generator public endpoint
 */
router.get('/image.png', function(req, res, next) {
  const width = 708;
  const height = 512;

  // Extract Parameters
  const roomArg = req.query.room || 'datacenter';
  const speciesArg = req.query.species || 'pokpok';
  const colorArg = req.query.color || 'blue';
  const stateArg = req.query.state || 'normal';
  const poopArg = req.query.poop || false;

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  (async () => {
    try {
      // Draw Room
      const room = await loadImage(path.join(__dirname, '../assets/rooms/' + roomArg + '.jpg'));
      context.drawImage(room, 0, 0);

      // Draw Poop
      if (poopArg) {
        const poop = await loadImage(path.join(__dirname, '../assets/poop.png'));
        const left = canvas.width / 2 - poop.width / 2 - 75;
        const top = canvas.height - poop.height - 5;
        context.drawImage(poop, left, top);
      }

      // Draw Pet
      const pet = await loadImage(path.join(__dirname, '../assets/pets/' + speciesArg + '/' + colorArg + '/' + stateArg + '.png'));
      const left = canvas.width / 2 - pet.width / 2;
      const top = canvas.height - pet.height - 5;
      context.drawImage(pet, left, top);

      // Set MIME and pipe to response
      res.setHeader('Content-Type', 'image/png');
      canvas.createPNGStream().pipe(res);
    } catch (err) {
      res.status(404).send({
        message: err,
      });
    }
  })();
});

/**
 * The webhook callback method.
 */
router.post('/callback', function(req, res, next) {
  let requestBody = req.body;

  // Log the full JSON payload received
  // console.log('requestBody: ' + JSON.stringify(requestBody));
  // console.log('requestHeader: ' + JSON.stringify(req.headers));

  // Extract the message payload parameters
  let conversationId = requestBody.conversationId;

  // Check that the message and text values exist
  if (requestBody.message !== undefined
    && requestBody.message.text !== undefined) {
    let message = requestBody.message.text;

    routeMessage(message, conversationId);
  } else if (requestBody.suggestionResponse !== undefined) {
    let message = requestBody.suggestionResponse.postbackData;

    routeMessage(message, conversationId);
  }

  res.sendStatus(200);
});

/**
 * Routes the message received from the user to create a response.
 *
 * @param {string} message The message text received from the user.
 * @param {string} conversationId The unique id for this user and agent.
 */
async function routeMessage(message, conversationId) {
  let normalizedMessage = message.trim().toLowerCase();

  console.log('normalizedMessage: ' + normalizedMessage);
  const words = normalizedMessage.split(' ');
  const command = words[0];

  // check for start message
  if (command === COMMAND_START) {
    const user = await firebaseHandler.getUser(conversationId);
    // console.log('user', user);
    if (!user) {
      sendUserSelection(conversationId);
      sendCarousel(conversationId);
    } else {
      sendResponse({
        messageId: uuid.v4(),
        representative: {
          representativeType: 'BOT',
        },
        text: `You have already adopted a ${user.petType}!`,
      }, conversationId);
    }
  } else if (command === COMMAND_CHOOSE_PET) {
    const user = await firebaseHandler.getUser(conversationId);
    // check if user is choosing a pet
    if (!user) {
      setUserPet(normalizedMessage, conversationId);
    } else {
      sendResponse({
        messageId: uuid.v4(),
        representative: {
          representativeType: 'BOT',
        },
        text: `You have already adopted a ${user.petType}!`,
      }, conversationId);
    }
  } else if (command === COMMAND_FEED_PET) {
    sendFoodOptions(conversationId);
  } else if (command === COMMAND_PLAY_WITH_PET) {
    const game = words[1];
    playWithPet(game, conversationId);
  } else if (command === COMMAND_CLEAN_PET) {
    cleanPet(conversationId);
  } else if (command === COMMAND_FOOD_ITEM) {
    const food = words[1]
    feedPet(food, conversationId);
  } else if (command === COMMAND_HELP) {
    // send error message
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      text: 'List of commands:\nfeed <food>\nplay <game>\nclean',
    }, conversationId);
  } else {
    // send error message
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      text: 'Command not recognized. Type help for a list of available commands.',
    }, conversationId);
  }
}


/**
 * sendFoodOptions - Send food options.
 * @param  {string} conversationId The conversation ID
 */
async function sendFoodOptions(conversationId) {
  sendResponse({
    messageId: uuid.v4(),
    representative: {
      representativeType: 'BOT',
    },
    suggestions: getFoodSuggestions(),
    text: 'Choose one of the foods below to feed your pet!',
  }, conversationId);
}

/**
 * feedPet - Feed pet with food.
 * @param {string} food 
 * @param {string} conversationId 
 */
async function feedPet(food, conversationId) {
  if (food === 'avocado') {
    await firebaseHandler.updateStat('hunger', 50);
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      suggestions: getDefaultSuggestions(),
      text: 'Great! Your pet is feeling a lot healthier!',
    }, conversationId);
  } else if (food === 'pizza') {
    await firebaseHandler.updateStat('hunger', 40);
    await firebaseHandler.updateStat('happiness', 50);
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      suggestions: getDefaultSuggestions(),
      text: 'Great! Your pet is feeling a lot happier! Make sure to watch the junk food, though!',
    }, conversationId);
  } else {
    await firebaseHandler.updateStat('hunger', 45);
    await firebaseHandler.updateStat('happiness', 45);
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      suggestions: getDefaultSuggestions(),
      text: 'Great choice! Your pet is feeling a lot happier and healthier!',
    }, conversationId);
  }
}

/**
 * playWithPet - Play game with pet
 * @param  {string} game The game type
 * @param  {string} conversationId The conversation ID
 */
async function playWithPet(game, conversationId) {
  // TODO: Implement game
  sendResponse({
    messageId: uuid.v4(),
    representative: {
      representativeType: 'BOT',
    },
    text: 'Play with pet not implemented yet',
  }, conversationId);
}


/**
 * cleanPet - Clean pet
 * @param  {type} conversationId The conversation ID
 */
async function cleanPet(conversationId) {
  // TODO: Implement clean
  sendResponse({
    messageId: uuid.v4(),
    representative: {
      representativeType: 'BOT',
    },
    text: 'Clean pet not implemented yet',
  }, conversationId);
}


/**
 * setUserPet - Set the pet of a user
 *
 * @param  {string} normalizedMessage The message
 * @param  {string} conversationId The conversation ID
 */
async function setUserPet(normalizedMessage, conversationId) {
  // extract pet type from 'choosepet {pet type}'
  let petType = normalizedMessage.split(' ')[1];
  // save in firebase + send response
  await firebaseHandler.setPetType(petType, conversationId);
  sendResponse({
    messageId: uuid.v4(),
    representative: {
      representativeType: 'BOT',
    },
    suggestions: getDefaultSuggestions(),
    text: `You have succesfully adopted a ${petType}!`,
  }, conversationId);
}

/**
 * Sends a pets rich card to the user.
 *
 * @param {string} conversationId The unique id for this user and agent.
 */
function sendCarousel(conversationId) {
  let carouselCard = getPetCarousel();
  let fallbackText = 'Pet List';

  sendResponse({
        messageId: uuid.v4(),
        fallback: fallbackText,
        representative: {
          representativeType: 'BOT',
        },
        richCard: {
          carouselCard: carouselCard,
        },
      }, conversationId);
}

function getDefaultSuggestions() {
  return [
    {
      reply: {
        text: 'Feed Your Pet!',
        postbackData: COMMAND_FEED_PET,
      },
    },
    {
      reply: {
        text: 'Clean Your Pet!',
        postbackData: COMMAND_CLEAN_PET,
      },
    },
    {
      reply: {
        text: 'Play With Your Pet!',
        postbackData: COMMAND_PLAY_WITH_PET,
      },
    },
  ];
}

function getFoodSuggestions() {
  return [
    {
      reply: {
        text: 'U+1F951',
        postbackData: COMMAND_FOOD_ITEM+' avocado',
      },
    },
    {
      reply: {
        text: '	U+1F355',
        postbackData: COMMAND_FOOD_ITEM+' pizza',
      },
    },
    {
      reply: {
        text: '	U+1F363',
        postbackData: COMMAND_FOOD_ITEM+' sushi',
      },
    },
  ];
}

/**
 * Creates a pet carousel
 *
 * @return {object} A carousel rich card.
 */
function getPetCarousel() {
  let cardContents = [];

  // Create individual cards for the carousel
  for (let petKey in pets) {
    if (pets.hasOwnProperty(petKey)) {
      let pet = pets[petKey];
      cardContents.push({
        title: pet.name,
        description: `Adopt a ${pet.name}!`,
        suggestions: {
          'reply': {
            'text': `Choose ${pet.name}`,
            'postbackData': `${COMMAND_CHOOSE_PET} ${petKey}`,
          },
        },
        media: {
          height: 'MEDIUM',
          contentInfo: {
            fileUrl: pet.image,
            forceRefresh: false,
          },
        },
      });
    }
  }
  return {
    cardWidth: 'MEDIUM',
    cardContents: cardContents,
  };
}

/**
 * sendUserSelection - send the starter screen for choosing pets
 *
 * @param  {type} conversationId The conversation ID
 */
function sendUserSelection(conversationId) {
  let messageObject = {
    messageId: uuid.v4(),
    representative: {
      representativeType: 'BOT',
    },
    text: 'It looks like you haven\'t registered before! Please choose a pet :)',
  };
  sendResponse(messageObject, conversationId);
}

/**
 * Posts a message to the Business Messages API, first sending a typing
 * indicator event and sending a stop typing event after the message
 * has been sent.
 *
 * @param {object} messageObject The message object payload to send to the user.
 * @param {string} conversationId The unique id for this user and agent.
 */
function sendResponse(messageObject, conversationId) {
  const apiConnector = apiHelper.init();
  apiConnector.then(function(apiObject) {
    // Create the payload for sending a typing started event
    let apiEventParams = {
      auth: apiObject.authClient,
      parent: 'conversations/' + conversationId,
      resource: {
        eventType: 'TYPING_STARTED',
        representative: {
          representativeType: 'BOT',
        },
      },
      eventId: uuid.v4(),
    };

    // Send the typing started event
    apiObject.bmApi.conversations.events.create(apiEventParams, {},
      (err, response) => {
      // console.error(err);
      // console.log(response);

      let apiParams = {
        auth: apiObject.authClient,
        parent: 'conversations/' + conversationId,
        resource: messageObject,
      };

      // Call the message create function using the
      // Business Messages client library
      apiObject.bmApi.conversations.messages.create(apiParams, {},
        (err, response) => {
        // console.log(err);
        // console.log(response);

        // Update the event parameters
        apiEventParams.resource.eventType = 'TYPING_STOPPED';
        apiEventParams.eventId = uuid.v4();

        // Send the typing stopped event
        apiObject.bmApi.conversations.events.create(apiEventParams, {},
          (err, response) => {
          // console.log(err);
          // console.log(response);
        });
      });
    });
  }).catch(function(err) {
    // console.log(err);
  });
}


/**
 * setupScheduler - Set schedulers to deplete H+H+H
 */
async function setupScheduler() {
  schedule.scheduleJob('30 * * * * *', async () => {
    let users = await firebaseHandler.getUserList();
    for (let conversationId in users) {
      if (users.hasOwnProperty(conversationId)) {
        if (users[conversationId].hunger > 0) {
          firebaseHandler.updateStat(conversationId,
            'hunger', users[conversationId].hunger - 1);
        }
        if (users[conversationId].happiness > 0) {
          firebaseHandler.updateStat(conversationId,
            'happiness', users[conversationId].happiness - 1);
        }
        if (users[conversationId].hygiene > 0) {
          firebaseHandler.updateStat(conversationId,
            'hygiene', users[conversationId].hygiene - 1);
        }
      }
    }
  });
}

setupScheduler();

module.exports = router;
