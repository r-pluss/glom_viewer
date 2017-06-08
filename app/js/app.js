const remote = require('electron').remote;
const fs = require('fs');
const path = require('path');
const {app} = require('electron').remote;
const appDataPath = path.join(app.getPath('userData'), 'config.json');

const $http = createConnection();

const vueApp = new Vue({
    el: '#app-root',
    data: {
        allMedia: [],
        baseURL: undefined,
        selectedMedia: []
    },
    methods: {
        getGlomSource: getGlomSource
    },
    mounted: start
});


//strictly for debugging ease
window._$app = vueApp;

function start(){
    let config = getConfig();
    if(config.hostname && config.username && config.password){
        getUserMedia(config.username);
    }else{
        showUserSettings();
    }
}

function createConnection(){
    let config = getConfig();
    if(config.hostname){
        return axios.create(
            {
                baseURL: `${config.hostname}${config.port ? ':' + config.port : ''}`,
                timeout: 3000
            }
        );
    }else{
        console.log('No hostname in config.');
        return undefined;
    }
}

function getConfig(){
    if(!fs.existsSync(appDataPath)){
        return {
            'hostname': null,
            'hostport': null,
            'username': null,
            'password': null
        };
    }else{
        return JSON.parse(fs.readFileSync(appDataPath, 'utf-8'));
    }
}

function getGlomSource(item){
    if(!vueApp.baseURL){
        let config = getConfig();
        vueApp.baseURL = `${config.hostname}${config.port ? ':' + config.port : ''}`;
    }
    return `${vueApp.baseURL}/media/${item.filename}`;
}

function getUserMedia(usr){
    $http(
        {
            method: 'GET',
            url: `/user_media/${usr}`
        }
    ).then(
        function(response){
            for(let item of response.data.media_list){
                vueApp.allMedia.push(item);
            }
        }
    )
}

function saveSettings(e){
    let conf = {
        hostname: document.getElementById('hostname').value,
        password: document.getElementById('userpassword').value,
        port: document.getElementById('hostport').value || null,
        username: document.getElementById('username').value
    };
    setConfig(conf);
    this.modal.close();
}

function setConfig(conf){
    fs.writeFileSync(appDataPath, JSON.stringify(conf));
}

function showUserSettings(){
    let modal = picoModal({
        content: `<div>
            <table>
                <tbody>
                    <tr>
                        <td>Host Name</td>
                        <td><input type= 'url' id= 'hostname'></td>
                    </tr>
                    <tr>
                        <td>Port</td>
                        <td><input type= 'number' id= 'hostport' placeholder= '(Optional)'></td>
                    </tr>
                    <tr>
                        <td>Username</td>
                        <td><input type= 'text' id= 'username'></td>
                    </tr>
                    <tr>
                        <td>Password</td>
                        <td><input type= 'password' id= 'userpassword'></td>
                    </tr>
                </tbody>
            </table>
            <button id = 'update-config'>Save</button>
        </div>`,
        width: '60vw'
    });
    modal.afterCreate(function(mod){
        let saveBtn = document.getElementById('update-config');
        saveBtn.modal = mod;
        saveBtn.addEventListener('click', saveSettings);
        let conf = getConfig();
        if(conf.hostname){
            document.getElementById('hostname').value = conf.hostname;
        }
        if(conf.password){
            document.getElementById('userpassword').value = conf.password;
        }
        if(conf.port){
            document.getElementById('hostport').value = conf.port;
        }
        if(conf.username){
            document.getElementById('username').value = conf.username;
        }
    });
    modal.afterClose(function(mod){mod.destroy();});
    modal.show();
}
