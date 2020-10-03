'use strict';
///////////////////////////////////////////////////////////////////////////////
// Dependencies
///////////////////////////////////////////////////////////////////////////////

const async = require('async');
const yaml = require('js-yaml');
const fs = require('fs');
const winston = require('winston');
const path = require('path');
const os = require('os');
const moment = require('moment-timezone');
const nodemailer = require('nodemailer');
const Nightmare = require('nightmare');
const sprintf = require('sprintf-js').sprintf;

///////////////////////////////////////////////////////////////////////////////
// Variable Initialization
///////////////////////////////////////////////////////////////////////////////


const START = "https://www.chase.com";

// Regular chase.com page loads the login fields+button within an iframe.
// Nightmare does not support interacting with iframes unfortunately :/
// This old Chase login page works, since it doesn't use sub-iframes.
// If Chase ever gets rid of that page, then we may need to try using this:
//   https://github.com/rosshinkley/nightmare-iframe-manager
const START_FOR_AUTO_LOGIN = "https://secure05a.chase.com/web/auth/#/logon/logon/chaseOnline?lang=en";

var config;
var arg_username;
var arg_password;
var nocred_mode = false;
var loglevel = 'info';
var configfile = path.resolve(__dirname,'config.yml');
var logfile = path.resolve(__dirname, 'chase-offer-monitor.log');
var historyfile = path.resolve(__dirname, 'chaseoffers-data.json');
var fakedatafile = path.resolve(__dirname, 'chaseoffers-fakedata.json');
var resultfile = path.resolve(__dirname, 'chaseoffers-result.html');
var leaveopen = false;

//debug vars
var debug_fake_data = false; //skips the chase lookup, loads a fake table instead to not pound their server
var debug_max_cards = -1; //if >= 0, only look at N cards, instead of all cards by default
var debug_nomail = false; //skip the email

///////////////////////////////////////////////////////////////////////////////
// Command-line processing
///////////////////////////////////////////////////////////////////////////////

process.argv.forEach((arg, i, argv) => {
  switch (arg) {
    case '--username':
      arg_username = argv[i + 1];
      break;
    case '--password':
      arg_password = argv[i + 1];
      break;
    case '--loglevel':
      loglevel = argv[i + 1];
      break;
    case '--fakedata':
      debug_fake_data = true;
      break;
    case '--nomail':
      debug_nomail = true;
      break;
    case '--maxcards':
      debug_max_cards = argv[i+1];
      break;
    case '--nocred': //use this if you don't want to provide your credentials into 
             //the script, but instead want to type them directly into the
             //electron window
      nocred_mode = true;
      break;
    case '--config':
      configfile = argv[i+1];
      break;
    case '--leaveopen':
      leaveopen = true;
      break;
  }
});

///////////////////////////////////////////////////////////////////////////////
// Configuration File Processing
///////////////////////////////////////////////////////////////////////////////

config = yaml.safeLoad(fs.readFileSync(configfile, 'utf8'))

///////////////////////////////////////////////////////////////////////////////
// Options final resolve
///////////////////////////////////////////////////////////////////////////////

const logger = winston.createLogger({
  transports: [
    new (winston.transports.File)({
      timestamp: true,
      json: false,
      level: loglevel,
      filename: logfile
    })
  ],
  exitOnError: false,
});

if (config.chase.historyfile) {
  historyfile = path.resolve(__dirname, config.chase.historyfile);
}

var au = null;
var ap = null;

if (!nocred_mode) {
  au = arg_username ? arg_username : config.chase.un ? config.chase.un : null;
  ap = arg_password ? arg_password : config.chase.p ? config.chase.p : null;
  if (!au) {
    let msg = "Must specify a username in config (config.chase.un) or with --username arg";
    console.error(msg);
    logger.error(msg);
    process.exit(1);
  }
  if (!ap) {
    let msg = "Must specify a password in config (config.chase.p) or with --password arg";
    console.error(msg);
    logger.error(msg);
    process.exit(1);
  }
}

const nightmare = new Nightmare({ show: true });
nightmare.on('console', (log, msg) => {
  //console.log(msg)
});
nightmare.on('logger', (info, msg) => {
  //logger.info(msg)
});
nightmare.useragent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36');

///////////////////////////////////////////////////////////////////////////////
// Support Functions
///////////////////////////////////////////////////////////////////////////////

function randomNumberBetween(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

function sortFactory(prop) {
  return function(a, b) {
    return a[prop].toLocaleLowerCase().localeCompare(b[prop].toLocaleLowerCase());
  };
}

function lexicographicSort(props) {
  return function(a, b) {
    for (let prop of props) {
      let a_prop = a[prop];
      let b_prop = b[prop];
      if (typeof a_prop == "string" && typeof b_prop == "string") {
        a_prop = a[prop].toLowerCase();
        b_prop = b[prop].toLowerCase();
      }
      if (a_prop == b_prop) {
        continue;
      }
      if (a_prop < b_prop) {
        return -1;
      }
      return 1;
    }
    return 0;
  };
};

async function tryFunctionNTimes(nightmare, fcn, n) {
  let ready = false;
  for (let i = 0; i < n && !ready; i++) {
    ready = await fcn();
    if (ready) break;
    await nightmare.wait(2000);
  }
  return ready;
}

async function chaseLogin(nightmare) {
  console.log('Logging into chase.com');
  logger.info('Logging into chase.com');

  let logged_in = false;

  try {
    if (nocred_mode) {
      await nightmare
          .goto(START)
          .wait(20000)
          .wait(20000)
          .wait('a[id*="cardlyticsSeeAllOffers"]')
          .click('a[id*="cardlyticsSeeAllOffers"]')
          .wait(2000);
      logged_in = true;
    } else {
      await nightmare
          .goto(START_FOR_AUTO_LOGIN)
          .wait('input[name="userId"]')
          .type('input[name="userId"]', au)
          .wait('input[name="password"]')
          .type('input[name="password"]', ap)
          .click('button[id*="signin-button"]')
          .wait(20000)
          .wait('a[id*="cardlyticsSeeAllOffers"]')
          .click('a[id*="cardlyticsSeeAllOffers"]')
          .wait(2000);
      logged_in = true;
    }
  } catch(e) {
    console.error(e);
    logger.error(e);
    process.exit(1);
  }
  if (logged_in) {
    console.log("Logged in and ready");
    logger.info("Logged in and ready");
  } else {
    console.error("Login Failed");
    logger.error("Login Failed");
    process.exit(1);
  }
}

// Chase personal accounts seem to use "mds-select-option--cpo", whereas
// Chase business accounts use "mds-select-option--bcb".
function getCardSelector(cardName) {
  let label_selector = '';
  if (cardName) {
    label_selector = '[label="' + cardName + '"]';
  }
  return 'mds-select-option[class*="mds-select-option--"]' + label_selector;
}

function getOfferSelector(merchantName) {
  let label_selector = '';
  if (merchantName) {
    label_selector = '[aria-label^="' + merchantName + '"]';
  }
  return 'a[class^="sixersoffers__cta"]' + label_selector;
}

async function getCardList(nightmare) {
  console.log('Getting list of card names...');
  logger.info('Getting list of card names...');

  const blank_card_selector = getCardSelector("");
  let card_names = await nightmare.evaluate((cards_sel) => {
    return Array.from(document.querySelectorAll(cards_sel)).map(
        el => el.getAttribute('label'));
  }, blank_card_selector);
  if (card_names.length == 0) {
    console.error('Failed to get card list.  Likely Chase changed the HTML and this program will need to be updated accordingly.');
    logger.error('Failed to get card list.  Likely Chase changed the HTML and this program will need to be updated accordingly.');
    process.exit(1);
  }

  console.dir(card_names);
  logger.debug(JSON.stringify(card_names, null, 2));
  console.log('Done getting list of card names...');
  logger.info('Done getting list of card names...');

  return card_names;
}

async function chooseCard(nightmare, cardName) {
  console.log('Choosing card "' + cardName + '"...');
  logger.info('Choosing card "' + cardName + '"...');

  const card_selector = getCardSelector(cardName);
  let success = await nightmare.evaluate((card_sel) => {
    let cards = document.querySelectorAll(card_sel);
    if (cards.length == 0) return false;
    cards[0].click();
    return true;
  }, card_selector);
  if (!success) {
    const msg = 'Failed to choose card "' + cardName + '".  Likely Chase changed the HTML and this program will need to be updated accordingly.';
    console.error(msg);
    logger.error(msg);
    process.exit(1);
  }

  console.log('Done with chooseCard "' + cardName + '"...');
  logger.info('Done with chooseCard "' + cardName + '"...');
}

const expandOfferList = async nightmare => {
  // Expand all "See more offers" until all are shown
  while (await nightmare.exists('a[blue-click*="requestMoreOffers"]')) {
    await nightmare.click('a[blue-click*="requestMoreOffers"]').wait(3000);
  }
}

async function closeFlyout(nightmare) {
  console.log('Closing flyout');
  while (await nightmare.visible('a[id="flyoutClose"]')) {
    await nightmare.click('a[id="flyoutClose"]').wait(3000);
  }
  console.log('Done closing flyout');
}

async function getOffers(nightmare) {
  console.log('Now getting offers');
  logger.info('Now getting offers');

  const current_time = moment().tz('America/New_York');

  try {
    await expandOfferList(nightmare);

    const blank_offer_selector = getOfferSelector('');
    let offers = await nightmare
      .wait('ul[class*="offerList"]')
      .wait(randomNumberBetween(2500, 3100))
      .evaluate((blank_offer_sel) => {
          return Array.from(document.querySelectorAll(
              'div[class="sixersoffers__container"]')).map(el => {
                let a_el = el.querySelector(blank_offer_sel);
                let merchant = "unknown";
                if (a_el && a_el.hasAttribute('aria-label')) {
                  merchant = a_el.getAttribute('aria-label');
                }
                let status = "eligible";
                if (merchant.endsWith(" Add to card")) {
                  merchant = merchant.substring(0, merchant.length - 12);
                }
                if (merchant.endsWith(" Added to card")) {
                  merchant = merchant.substring(0, merchant.length - 14);
                  status = "enrolled";
                }
                const deal = el.querySelector('div[class*="sixerscontent-one"]').innerText;
                const days_left_string = el.querySelector('div[class*="sixerscontent-two"]').innerText;
                return {
                    merchant: merchant,
                    deal: deal,
                    days_left_string: days_left_string,
                    status: status,
                    days_left: -1,
                    expiration: "unknown",
                    maximum: -1.0,
                    offer_key: "unset",
                    minimum_purchase: -1.0
                };
            })
      }, blank_offer_selector);

    for (let i = 0; i < offers.length; i++) {
      let days_left_re = new RegExp('(\\d+) days? left');
      let days_left_re_result = days_left_re.exec(offers[i].days_left_string);
      if (days_left_re_result) {
        offers[i].days_left = days_left_re_result[1]; 
      } else {
        days_left_re = new RegExp('Last day');
        days_left_re_result = days_left_re.exec(offers[i].days_left_string);
        if (days_left_re_result) {
          offers[i].days_left = 0;
        }
      }

      if (offers[i].days_left >= 0) {
        var expiration_date = moment(current_time);
        expiration_date.add(offers[i].days_left, 'days');
        offers[i].expiration = expiration_date.format('YYYY-MM-DD');
      } else {
        offers[i].expiration = offers[i].days_left_string;
      }

      offers[i].offer_key = offers[i].merchant + " | " + offers[i].deal + " | " + offers[i].expiration;

      let deal_re = new RegExp('\\$([\\d\\.]+) back');
      let deal_re_result = deal_re.exec(offers[i].deal);
      if (deal_re_result) {
        offers[i].maximum = parseFloat(deal_re_result[1]);
      }
    }

    for (let i = 0; i < offers.length; i++) {
      if (offers[i].status != "enrolled") continue;
      console.log('Getting max for ' + offers[i].merchant);
      logger.info('Getting max for ' + offers[i].merchant);
      const added_button_selector = getOfferSelector(offers[i].merchant);
      await expandOfferList(nightmare);
      try {
        await nightmare
          .wait(added_button_selector)
          .wait(randomNumberBetween(500, 750))
          .click(added_button_selector)
          .wait(randomNumberBetween(2500, 3100));
        if (await nightmare.exists('div[class~="offerdetails__content"]')) {
          const details = await nightmare.evaluate(() => {
              return document.querySelector('div[class~="offerdetails__content"]').innerText;
          });
          let max_re = new RegExp('\\$([\\d\\.]+) back');
          let max_re_result = max_re.exec(details);
          if (max_re_result) {
            offers[i].maximum = parseFloat(max_re_result[1]);
          }
          let min_re = new RegExp('\\$([\\d\\.]+) or more');
          let min_re_result = min_re.exec(details);
          if (min_re_result) {
            offers[i].minimum_purchase = parseFloat(min_re_result[1]);
          }
        }
      } catch (e) {
        console.log('Failed to get maximum for ' + offers[i].merchant);
        console.error(e);
      }
      await closeFlyout(nightmare);
    }

    console.dir(offers);
    logger.debug(offers);
    return offers;
  } catch(e) {
    // If there are no offers on the card, this block will be executed.
    // In that case, it isn't really an "error", and the rest of the script
    // should work fine.
    console.error(e);
    logger.error(e);
    return [];
  }
}  

async function send_email(message) {

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: config.email.from_smtp_server,
    port: config.email.from_smtp_port,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.email.from_address,
      pass: config.email.from_p
    }
  });

  // send mail with defined transport object
  let timestamp = moment().format("MMM Do, h:mm a");
  let emailsubject = (config.email.subject ? config.email.subject : "Chase Offer Update") + " : " + timestamp;
  let info = await transporter.sendMail({
    from: '"Chase Offer Monitor" <' + config.email.from_address + '>', // sender address
    to: config.email.to, // list of receivers
    subject: emailsubject,
    text: "", // plain text body
    html: message // html body
  });

  console.log("Message sent: %s", info.messageId);
}

function keyByOffer(data) {
  console.debug("keyByOffer: \n");
  console.debug(data);
  logger.debug("keyByOffer: \n");
  logger.debug(data);

  let alloffers = {};
  for (let card in data) {
    if (Array.isArray(data[card])) {
      for (let i = 0; i< data[card].length; i++) {
        const status = data[card][i].status;
        const offer_key = data[card][i].offer_key;
        const cardname = (status == 'enrolled') ? "(Added) " + card : card;
        if (offer_key in alloffers) {
          alloffers[offer_key].cards.push(cardname);
          alloffers[offer_key].any_added = alloffers[offer_key].any_added || (status == 'enrolled');
          if (alloffers[offer_key].maximum < 0.0 && data[card][i].maximum > 0.0) {
            alloffers[offer_key].maximum = data[card][i].maximum;
          }
          if (alloffers[offer_key].minimum_purchase < 0.0 && data[card][i].minimum_purchase > 0.0) {
            alloffers[offer_key].minimum_purchase = data[card][i].minimum_purchase;
          }
        } else {
          let offerobj = { ...data[card][i] };
          delete offerobj.status;
          offerobj.cards = [cardname];
          alloffers[offer_key] = offerobj;
          offerobj.any_added = (status == 'enrolled');
        }
      }
    }
  }

  // Sort alloffers by merchant, then deal, then days_left, then expiration.
  let alloffers_array = Object.values(alloffers);
  alloffers_array.sort(lexicographicSort(['merchant', 'deal', 'days_left', 'expiration']))

  console.debug("END keyByOffer\n");
  console.debug(alloffers_array);
  logger.debug("END keyByOffer\n");
  logger.debug(alloffers_array);

  return alloffers_array;
}


function printHtmlTable(offers) {

  console.debug("printHtmlTable: \n");
  console.debug(offers);
  logger.debug("printHtmlTable: \n");
  logger.debug(offers);

  let html = "<table border='1'>";
  for (let offer of offers) {
    html += "<tr>";
    html += "<td>" + offer.deal;
    html += (offer.maximum < 0.0) ? ", unknown max" : (" up to $" + offer.maximum.toFixed(2));
    html += "<td>" + offer.merchant;
    html += "<td>" + offer.expiration;
    html += "<td>" + ((offer.minimum_purchase < 0.0) ? (offer.any_added ? "No minimum" : "Unknown min") : ("$" + offer.minimum_purchase.toFixed(2) + " minimum"));
    html += "<td>" + offer.cards.join("<br>");
    html += "</tr>\n";
  }
  html += "</table>";

  console.debug("END printHtmlTable\n");
  logger.debug("END printHtmlTable\n");
  return html;
}

function printSummaryTable(data) {

  console.debug("printSummaryTable: \n");
  console.debug(data);
  logger.debug("printSummaryTable: \n");
  logger.debug(data);
  let html = "<table border='1'>";
  html += "<tr><td>Card<td># Eligible<td># Enrolled</tr>";
  for (let card in data) {
    html += "<tr>";
    html += "<td>" + card;
    let count_eligible = 0;
    let count_enrolled = 0;
    if (Array.isArray(data[card])) {
      for (let i = 0; i< data[card].length; i++) {
        if (data[card][i].status == 'eligible') { count_eligible++; }
        if (data[card][i].status == 'enrolled') { count_enrolled++; }
      }
    }
    html += "<td>" + count_eligible + "<td>" + count_enrolled + "</tr>";
  }
  html += "</table>";

  console.debug("END printSummaryTable\n");
  logger.debug("END printSummaryTable\n");
  return html;

}

async function asyncMain(nightmare) {

  const fs = require('fs')
  let olddata = {};
  if (fs.existsSync(historyfile)) {
    olddata = JSON.parse(fs.readFileSync(historyfile));
    fs.copyFileSync(historyfile, historyfile + "_backup", (err) => {
      if (err) throw err;
    });
  }

  let newdata = {};
  if (debug_fake_data) {
    newdata = JSON.parse(fs.readFileSync(fakedatafile));
  } else {
    try {
      await chaseLogin(nightmare);
      let card_names = await getCardList(nightmare);
      for (let card_name of card_names) {
        await chooseCard(nightmare, card_name);
        let offers = await getOffers(nightmare);
        newdata[card_name] = offers;
      }
    } catch(e) {
      console.error(e);
      logger.error(e);
    }
  }

  if (!leaveopen) {
    await nightmare.end(() => "nightmare ended").then((value) => console.log(value));
  }

  console.log("Done with all Electron Execution. Data collected: \n");
  console.dir(newdata);
  logger.debug("Done with all Electron Execution. Data collected: \n");
  logger.debug(JSON.stringify(newdata, null, 2));

  let cardsadded = [];
  let cardsremoved = [];
  let addedoffers = {};
  let removedoffers = {};
  let extendedoffers = {};
  let expiringSoonEnrolledOffers = {};
  let expiringSoonEligibleOffers = {};
  
  for (let key in olddata) {
    if (!(key in newdata)) {
      cardsremoved.push(key);
    }
  }

  //it through newdata
  //if matches olddata, delete olddata
  //if doesnt match olddata, it's new
  //whatever remains in olddata is dead offer
  //
  for (let key in newdata) {
    if (!(key in olddata)) {
      cardsadded.push(key);
      addedoffers[key] = newdata[key]; 
      extendedoffers[key] = [];
      removedoffers[key] = [];
    } else {
      let cardoffers_new = newdata[key];
      let cardoffers_old = olddata[key];
      addedoffers[key] = [];
      extendedoffers[key] = [];

      for (let i=0; i< cardoffers_new.length; i++) {
        let match = false;
        for (let j=0; j< cardoffers_old.length; j++) {
          if (cardoffers_old[j].offer_key == cardoffers_new[i].offer_key) {
            match = true;
            cardoffers_old.splice(j,1);
            break;
          }
          if (cardoffers_old[j].merchant == cardoffers_new[i].merchant &&
              cardoffers_old[j].deal == cardoffers_new[i].deal) {
            // This happens when an old offer has its expiration date extended.
            // Chase seems to frequently do this.
            extendedoffers[key].push(cardoffers_new[i]);
            match = true;
            cardoffers_old.splice(j,1);
            break;
          }
        }
        if (match == false) {
          //offer is new
          addedoffers[key].push(cardoffers_new[i]);
        }
      }
      //whatever's left, is a removed offer
      removedoffers[key] = cardoffers_old;
    }
  }

  console.log("Cards Added: \n");
  console.dir(cardsadded);
  console.log("Cards Removed: \n");
  console.dir(cardsremoved);
  console.log("Offers Added: \n");
  console.dir(addedoffers);
  console.log("Offers Extended: \n");
  console.dir(extendedoffers);
  console.log("Offers Removed: \n");
  console.dir(removedoffers);

  logger.info("Cards Added: \n");
  logger.info(JSON.stringify(cardsadded, null, 2));
  logger.info("Cards Removed: \n");
  logger.info(JSON.stringify(cardsremoved, null, 2));
  logger.info("Offers Added: \n");
  logger.info(JSON.stringify(addedoffers, null, 2));
  logger.info("Offers Extended: \n");
  logger.info(JSON.stringify(extendedoffers, null, 2));
  logger.info("Offers Removed: \n");
  logger.info(JSON.stringify(removedoffers, null, 2));

  let send_message = false;
  let notify_message = "<html><body>"

  if (cardsadded.length > 0) {
    notify_message += "<h2>New Cards Found:</h2> <br>";
    notify_message += cardsadded.join("<br>");
    notify_message += "<br><br>";
    send_message = true;
  }
  if (cardsremoved.length > 0) {
    notify_message += "<h2>Old Cards Not Found:</h2> <br>";
    notify_message += cardsremoved.join("<br>");
    notify_message += "<br><br>";
    send_message = true;
  }

  for (let mode = 0; mode < 3; mode++) {
    let header = "New Offers Found";
    let enable = config.chase.notify_new;
    let offers = addedoffers;
    if (mode == 1) {
      header = "Extended Offers";
      enable = config.chase.notify_extended;
      offers = extendedoffers;
    }
    if (mode == 2) {
      header = "Old Offers Removed";
      enable = config.chase.notify_removed;
      offers = removedoffers;
    }
    let htmlmsg = "<h2>" + header + "</h2>";
    let any_offers_match = false;
    if (enable) {
      for (let key in offers) {
        if (Array.isArray(offers[key]) && offers[key].length > 0) {
          send_message = true;
          any_offers_match = true;
          break;
        }
      }
      htmlmsg += printHtmlTable(keyByOffer(offers));
      if (any_offers_match) {
        notify_message += htmlmsg;
      }
    }
  }

  for (let mode = 0; mode < 2; mode++) {
    let enabled = mode == 0 ? config.chase.notify_enrolled_expiration : config.chase.notify_eligible_expiration;
    if (!enabled) {
      continue;
    }
    let any_expiring = false;
    let type = mode == 0 ? 'enrolled' : 'eligible';
    let days_config = mode == 0 ? config.chase.notify_enrolled_expiration_days : config.chase.notify_eligible_expiration_days;
    let htmlmsg = "<h2> " + type + " Offers Expiring Soon:</h2><table>";
    let tempdata = {};
    let expiring_array = new Array(days_config+1);
    for (let i =0; i< days_config+1; i++) {
      expiring_array[i] = [];
    }

    for (let card in newdata) {
      tempdata[card] = [];
      for (let i = 0; i < newdata[card].length; i++) {
        if (newdata[card][i].status == type && newdata[card][i].days_left <= days_config) {
          any_expiring = true;
          tempdata[card].push(newdata[card][i]);
        }
      }
    }

    if (any_expiring) {
      send_message = true;
      notify_message += htmlmsg + printHtmlTable(keyByOffer(tempdata));
    }
  }

  if (config.chase.notify_summary_table) {
    notify_message += "<h2> Count of all offers for cards:</h2><table>"; 
    notify_message += printSummaryTable(newdata);
  }

  for (let mode = 0; mode < 2; mode++) {
    let enable = mode == 0 ? config.chase.notify_all_enrolled : config.chase.notify_all_eligible;
    if (!enable) {
      continue;
    }
    let type = mode == 0 ? "enrolled" : "eligible";
    let htmlmsg = "<h2> Summary of all current " + type + " offers:</h2><table>"; 
    let any_offers = false;
    let tempdata = {};
    for (let card in newdata) {
      tempdata[card] = [];
      let cardoffers = newdata[card];
      for (let i=0; i< cardoffers.length; i++) {
        let offerstatus = cardoffers[i].status;
        if (offerstatus == type) {
          send_message = true;
          any_offers = true;
          tempdata[card].push(cardoffers[i]);
        } 
      }
    }
    htmlmsg += printHtmlTable(keyByOffer(tempdata));
    notify_message += any_offers ? htmlmsg : "";
  }

  notify_message += "</body></html>";

  try {
    if (!debug_nomail) { 
      if (send_message) {
        await send_email(notify_message);
        console.log("Email sent");
        logger.info("Email sent");
      } else {
        console.log("Script ran successfully but didn't find any reason to send an email, so nothing sent");
        logger.info("Script ran successfully but didn't find any reason to send an email, so nothing sent");
      }
      if (!debug_fake_data) {
        fs.writeFileSync(historyfile, JSON.stringify(newdata, null, 2));
      }
    }
  } catch(e) { 
    console.error(e);
    logger.error(e);
  }

  fs.writeFileSync(resultfile, notify_message);

}

////////////////// MAIN THREAD ////////////////////////////

logger.info("Starting execution of chase-offer-monitor");
asyncMain(nightmare);
