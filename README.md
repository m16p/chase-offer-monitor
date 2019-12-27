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

* notify\_all\_enrolled : Receive a summary about all enrolled offers on all cards
* notify\_all\_eligible : Receive a summary about all eligible offers on all cards (probably huge!)


## Other notes

It helps the output readability if you give the Chase cards "nicknames" in your Chase accounts.  This unfortunately doesn't seem to be possible for Chase business card accounts :/  So it'll just say "BUSINESS CARD (...[last 4 digits])" for business cards.

### Multiple Accounts ###
If you want to handle multiple chase accounts, you can create a separate config file for each account. Add a chase:historyfile key to each config file indicating a filename in the directory that you want to use for each account. You may also customize the email subject with a email:subject key. This should allow you to run the program for multiple accounts without thrashing the data between the two. To run with a config file other than the default config.yml, launch `node chase-offer-monitor.js --config mycustomconfigfile.yml`
