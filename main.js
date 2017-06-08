'use strict';

const electron = require('electron');
/*const fs = require('fs');
const path = require('path');*/
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
//const appDataPath = path.join(app.getPath('userData'), 'config.json');
const debug = false;

var mainWindow;

app.on('ready', function(){
    mainWindow = new BrowserWindow({
        height: electron.screen.getPrimaryDisplay().size.height,
        width: electron.screen.getPrimaryDisplay().size.width,
        webPreferences: {
            nodeIntegration: true
        }
    });
    mainWindow.webContents.on(
        'new-window',
        function(e, url){
            e.preventDefault();
            electron.shell.openExternal(url);
        }
    )
    //mainWindow.setFullScreen(true);
    mainWindow.loadURL(`file://${__dirname}/app/index.html`);
});
