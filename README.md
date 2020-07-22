# chase-offer-monitor

## Setup

1. Unpack the code to a folder .../chase-offer-monitor

2. Install the Node.js application by running `npm install` from the directory (Install node.js on your system first if you don't have it.)

3. Rename config.yml.example to config.yml

4. chase credentials - If you want the script to run automatically without any manual intervention, then update your username & password in the config file.  If you don't want to leave them in plaintext on your hard-drive, then there are two alternatives:  run the script with `--nocred` (which means you'll enter the credentials into the browser window manually), or you can set the `--username <username> --password <password>` command-line-arguments on each run of the script

5. Email support - If you want to receive email updates from chase-offer-monitor, you need an email account to send the mail from. I recommend a free/throwaway mail.com account, but you can use others. Update config.yml with your inbox address, and your sender's email, password, smtp\_port, and smtp\_server. (smtp settings configured for mail.com)

6. To launch the script, open a command window or powershell, and from the script directory run `node chase-offer-monitor.js`

## Configuration Options

* notify\_new: Email will contain all new offers detected since the last time the script ran
* notify\_extended: Email will contain all offers which were present before but now have a new expiration date
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

### Help, Automatic Login stopped working! ###
The automatic login feature (either through setting the username+password in the config file, or using the `--username <username> --password <password>` command-line-arguments) is somewhat brittle.  It relies on using a Chase login page which does *not* put the username/password textfields in a sub-iframe.  Most Chase login pages do put these in sub-iframes, unfortunately.  As of this writing, the URL set by `START_FOR_AUTO_LOGIN` in the .js file does not have sub-iframes, so that works currently.  But Chase could change that at any point (like they did for the previous `START_FOR_AUTO_LOGIN` page I was using).

If the script suddenly just hangs at login seemingly doing nothing, then try running the script with `--nocred` (manually entering your username+password in the browser) and see if it works.  If that works, then that means that auto-login has stopped working likely because Chase has changed the `START_FOR_AUTO_LOGIN` to have sub-iframes again.  PM me and I can try to fix it, though in the meantime hopefully using `--nocred` works alright.

### Unknown min/max ###
Until you add an offer to your card, Chase does not display the minimum purchase or maximum discount.  So for eligible-but-not-added offers, those values will say "unknown" in the email.

### Why not just add every offer? ###
For Amex Offers, we know that there are:

1. Per user, there is a maximum number of offers you can be enrolled in at a time.

2. Per offer, there is a maximum number of users who can enroll in it.

Adding every Amex Offer to your account both hurts yourself (because of #1, since it may mean that you won't be able to add an offer you actually want later on) and others (because of #2).  We assume Chase Offers are similar.  So **please don't enroll in offers you know you won't use!**

### Card Nicknames ###
It helps the output readability if you give the Chase cards "nicknames" in your Chase account(s).  This unfortunately doesn't seem to be possible for Chase business cards :/  So it'll just say "BUSINESS CARD (...[last 4 digits])" for business cards -- you'll just need to remember the last-4-digits of each of those.

### Multiple Accounts ###
If you want to handle multiple chase accounts, you can create a separate config file for each account. Add a chase:historyfile key to each config file indicating a filename in the directory that you want to use for each account. You may also customize the email subject with a email:subject key. This should allow you to run the program for multiple accounts without thrashing the data between the two. To run with a config file other than the default config.yml, launch `node chase-offer-monitor.js --config mycustomconfigfile.yml`

### Time Zone funniness ###
If you run the program across a day-boundary in EST, then there may be some funniness in the output, since the program has to convert "NN days left" to an actual date.

### Closed Cards ###
One user has reported that the program seems to get stuck when you have closed cards in your Chase account.  I don't have any closed cards, so I'm unable to debug on my own.  If anyone has closed cards and is willing to run a few tests, let me know!

## Credit to karwosts

This code is based highly on the Amex Offer Monitor (https://github.com/karwosts/amex-offer-monitor).  I got permission from that author to upload my version for Chase.
