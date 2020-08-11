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

const os = require('os');
const path = require('path');
const express = require('express');
const router = express.Router();
const uuid = require('uuid');
const schedule = require('node-schedule');
const firebaseHandler = require('../lib/firebase_helper');
const apiHelper = require('../lib/api_helper');
const pets = require('../resources/pets.json');
const {createCanvas, loadImage} = require('canvas');

const COMMAND_START = 'start';
const COMMAND_CHOOSE_PET = 'choosepet';
const COMMAND_FEED_PET = 'feed';
const COMMAND_PLAY_WITH_PET = 'play';
const COMMAND_CLEAN_PET = 'clean';
const COMMAND_SET = 'set';
const COMMAND_HELP = 'help';

/**
 * Image generator public endpoint
 */
router.get('/hello', function(req, res, next) {
    res.redirect(generateImageUrl(req, null));
});
router.get('/image.png', function(req, res, next) {
  // Extract Parameters
  const roomArg = req.query.room || 'bedroom';
  const speciesArg = req.query.species || 'pokpok';
  const colorArg = req.query.color || 'blue';
  const stateArg = req.query.state || 'normal';
  const poopArg = req.query.poop || 'false';

  
  (async () => {
    try {
      // Draw Room
      const room = await loadImage(path.join(__dirname, '../assets/rooms/' + roomArg + '.jpg'));
      const canvas = createCanvas(room.width, room.height);
      const context = canvas.getContext('2d');
      context.drawImage(room, 0, 0);

      // Draw Poop
      if (poopArg == 'true') {
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

    routeMessage(req, message, conversationId);
  } else if (requestBody.suggestionResponse !== undefined) {
    let message = requestBody.suggestionResponse.postbackData;

    routeMessage(req, message, conversationId);
  }

  res.sendStatus(200);
});

/**
 * Routes the message received from the user to create a response.
 *
 * @param {string} message The message text received from the user.
 * @param {string} conversationId The unique id for this user and agent.
 */
async function routeMessage(req, message, conversationId) {
  let normalizedMessage = message.trim().toLowerCase();

  console.log('normalizedMessage: ' + normalizedMessage);
  const words = normalizedMessage.split(' ');
  const command = words[0];
  const user = await firebaseHandler.getUser(conversationId);

  // check for start message
  if (command === COMMAND_START) {
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
    const food = words[1];
    feedPet(req, user, conversationId, food);
  } else if (command === COMMAND_PLAY_WITH_PET) {
    const game = words[1];
    playWithPet(game, conversationId);
  } else if (command === COMMAND_CLEAN_PET) {
    cleanPet(conversationId);
  } else if (command === COMMAND_SET) {
    if(words.length === 3) {
      firebaseHandler.updateStat(conversationId, words[1], parseInt(words[2]));
      sendResponse({
        messageId: uuid.v4(),
        representative: {
          representativeType: 'BOT',
        },
        text: `${words[1]} set to ${words[2]}`,
      }, conversationId);
    } else {
      sendResponse({
        messageId: uuid.v4(),
        representative: {
          representativeType: 'BOT',
        },
        text: 'Command not recognized. Usage:\nset hunger 100',
      }, conversationId);
    }
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

const FOOD = ['🍗', '🍔', '🍕', '🌮', '🥪', '🍣', '🥝', '🍓', '🍖'];
/**
 * feedPet - Feed pet
 *
 * @param  {object} req The HTTP request.
 * @param  {object} user The user data.
 * @param  {string} conversationId The conversation ID.
 * @param  {string} food The food type.
 */
async function feedPet(req, user, conversationId, food) {
  if(food) {
    if(FOOD.indexOf(food) === -1) {
      sendResponse({
        messageId: uuid.v4(),
        representative: {
          representativeType: 'BOT',
        },
        text: `You don't have any ${food}!`,
      }, conversationId);
    } else {
      if(user.hunger >= 100) {
        sendStatusCard(req, user, conversationId, `${user.name} is too bloated to eat!`);
      } else {
        let val = randomInt(5) + 1;
        firebaseHandler.updateStat(conversationId,'hunger', user.hunger + val);
        sendStatusCard(req, user, conversationId, `${food} | You feed your pet! (+${val} food)`);
      }
    }
  } else {
    // Generate 3 random foods
    console.log('Generate foods');
    let foods = [];
    while(foods.length < 3){
      var f = randomInt(FOOD.length);
      console.log(`Generated ${FOOD[f]}`);
      if(foods.indexOf(FOOD[f]) === -1) foods.push(FOOD[f]);
    }
    sendResponse({
      messageId: uuid.v4(),
      representative: {
        representativeType: 'BOT',
      },
      text: 'What do you want to feed your pet?',
      suggestions: [
        {
          'reply': {
            'text': foods[0],
            'postbackData': `${COMMAND_FEED_PET} ${foods[0]}`,
          },
        },
        {
          'reply': {
            'text': foods[1],
            'postbackData': `${COMMAND_FEED_PET} ${foods[1]}`,
          },
        },
        {
          'reply': {
            'text': foods[2],
            'postbackData': `${COMMAND_FEED_PET} ${foods[2]}`,
          },
        },
      ],
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
    text: `You have succesfully adopted a ${petType}!`,
  }, conversationId);
}

/**
 * Returns a random integer from 0 (inclusive) to n (exclusive).
 *
 * @param {number} n
 */
function randomInt(n) {
  return Math.floor(Math.random() * n);
}

/**
 * Generate an image representing the state of the room.
 *
 * @param {object} req The HTTP request.
 * @param {object} pet The user data.
 */
function generateImageUrl(req, pet) {
    pet = pet || {};
    const room = pet.room || 'bedroom';
    const species = pet.species || 'pokpok';
    const color = pet.color || 'blue';
    const poop = pet.hygiene < 80;
    
    let state = 'normal';
    
    if(pet.hunger >= 80 && pet.hygiene >= 80 && pet.happiness > 80) {
      state = 'happy';
    } else if(pet.hunger < 50) {
      state = 'hungry';
    } else if(pet.hygiene < 50) {
      state = 'angry';
    } else if(pet.happiness < 50) {
      state = 'bored';
    }
    
    return url = req.protocol + '://' + req.get('host') + '/image.png?'
      + 'room=' + room
      + '&species=' + species
      + '&color=' + color
      + '&state=' + state
      + '&poop=' + poop
    ;
}

/**
 * Sends a standalone card with status of the pet.
 *
 * @param {object} req The HTTP request.
 * @param {object} user The user data.
 * @param {string} conversationId The unique id for this user and agent.
 * @param {string} message The text that goes in the status card.
 */
function sendStatusCard(req, user, conversationId, message) {
  let statusCard = {
      'cardContent':{
        description: message,
        media: {
          height: 'TALL',
          contentInfo: {
            fileUrl: generateImageUrl(req, user),
            forceRefresh: false,
          },
        },
      }
  };

  sendResponse({
        messageId: uuid.v4(),
        fallback: message,
        representative: {
          representativeType: 'BOT',
        },
        richCard: {
          standaloneCard: statusCard,
        },
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
      console.error(err);
      console.log(response);

      let apiParams = {
        auth: apiObject.authClient,
        parent: 'conversations/' + conversationId,
        resource: messageObject,
      };

      // Call the message create function using the
      // Business Messages client library
      apiObject.bmApi.conversations.messages.create(apiParams, {},
        (err, response) => {
        console.log(err);
        console.log(response);

        // Update the event parameters
        apiEventParams.resource.eventType = 'TYPING_STOPPED';
        apiEventParams.eventId = uuid.v4();

        // Send the typing stopped event
        apiObject.bmApi.conversations.events.create(apiEventParams, {},
          (err, response) => {
          console.log(err);
          console.log(response);
        });
      });
    });
  }).catch(function(err) {
    console.log(err);
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
