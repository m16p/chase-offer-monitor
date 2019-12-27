# chase-offer-monitor

## Setup

1. Unpack the code to a folder .../chase-offer-monitor

2. Install the Node.js application by running `npm install` from the directory (Install node.js on your system first if you don't have it.)
3. Rename config.yml.example to config.yml

4. chase credentials - either update your username & password in the config file, or if you don't want to leave them in plaintext on your harddrive, supply them some other way via `--username <username> --password <password>` on each run of the script

5. Email support - If you want to receive email updates from chase-offer-monitor, you need an email account to send the mail from. I recommend a free/throwaway mail.com account, but you can use others. Update config.yml with your inbox address, and your sender's email, password, smtp\_port, and smtp\_server. (smtp settings configured for mail.com)

6. Automation - the script is intended to be run once per day or so. You can do this with cron on linux or taskschd.msc on windows, so you just get a daily digest of your chase offer status.

7. To launch the script, open a command window or powershell, and from the script directory run `node chase-offer-monitor.js`

## Configuration Options

* notify\_new: Email will contain all new offers detected since the last time the script ran
* notify\_removed: Email will contain all offers no longer detected that existed the last time the script ran

* notify\_eligible\_expiry: Get a reminder about any eligible offers (not added to card) which are expiring soon. 
* notify\_enrolled\_expiry: Get a reminder about any enrolled offers (added to card) which are expiring soon. 

* notify\_eligible\_expiry\_days: Number of days in advance to warn about expiration for eligible offers (max 10)
* notify\_enrolled\_expiry\_days: Number of days in advance to warn about expiration for enrolled offers (max 10)

* notify\_all\_enrolled: Receive a summary about all enrolled offers on all cards
* notify\_all\_eligible: Receive a summary about all eligible offers on all cards (probably huge!)

* notify\_summary\_table: Display a summary table of the number of enrolled/eligible offers per card.

* historyname: If you have multiple Chase accounts, specify the file-name of the history file for this account.


## Other notes

### Card Nicknames ###
It helps the output readability if you give the Chase cards "nicknames" in your Chase account(s).  This unfortunately doesn't seem to be possible for Chase business cards :/  So it'll just say "BUSINESS CARD (...[last 4 digits])" for business cards -- you'll just need to remember the last-4-digits of each of those.

### Multiple Accounts ###
If you want to handle multiple chase accounts, you can create a separate config file for each account. Add a chase:historyfile key to each config file indicating a filename in the directory that you want to use for each account. You may also customize the email subject with a email:subject key. This should allow you to run the program for multiple accounts without thrashing the data between the two. To run with a config file other than the default config.yml, launch `node chase-offer-monitor.js --config mycustomconfigfile.yml`

### Time Zone funniness ###
If you run the program across a day-boundary in EST, then there may be some funniness in the output, since the program has to convert "NN days left" to an actual date.

### Chase Extending Offers ###
Chase Offers seem to frequently be auto-extended another week.  On several occasions, I clearly had an offer saying "10 days left" and then 5 days later that same offer says "12 days left".  I'm guessing Chase/offer-merchants extend them week-by-week sometimes.  Right now when this happens it is treated as a new offer, since the expiration date is part of the key in the history-file lookup so it is treated as a new offer.

## Credit to karwosts

This code is based highly on the Amex Offer Monitor (https://github.com/karwosts/amex-offer-monitor).  I got permission from that author to upload my version for Chase.
