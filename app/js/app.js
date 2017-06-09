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
        selectedMedia: [],
        uniqueTags: []
    },
    methods: {
        getGlomSource: getGlomSource,
        queryUserInput: queryUserInput,
        showUserSettings: showUserSettings
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
        vueApp.showUserSettings();
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

function extractUniqueTags(item){
    for(let tag of item.tags){
        if(vueApp.uniqueTags.indexOf(tag) < 0){
            vueApp.uniqueTags.push(tag);
        }
    }
}

function findMediaByTags(qry){
    results = [];
    for(let item of vueApp.allMedia){
        let exclusionFound = false;
        let requirementMissing = false;
        let inclusionFound = false;
        for(let exclusion of qry.exclude){
            if(item.tags.indexOf(exclusion) > -1){
                console.log('Found exclusion');
                exclusionFound = true;
                break;
            }
        }
        for(let requirement of qry.require){
            if(item.tags.indexOf(requirement) < 0){
                console.log('Requirement missing');
                requirementMissing = true;
                break;
            }
        }
        for(let inclusion of qry.include){
            if(item.tags.indexOf(inclusion) > -1){
                console.log('Found inclusion');
                inclusionFound = true;
                break;
            }
        }
        if(!exclusionFound && !requirementMissing){
            if(qry.include.length > 0){
                if(inclusionFound){
                    results.push(item);
                }
            }else{
                results.push(item);
            }
        }
    }
    return results;
}
/*
function _findMediaByTags(qry){
    results = [];
    for(let item of vueApp.allMedia){
        //opt for short-circuiting behavior of exclusions first
        if(qry.exclude.length > 0){
            for(let exclusion of qry.exclude){
                if(Array.isArray(exclusion)){
                    let exclusionFound = false;
                    for(let _exclusion of exclusion){
                        if(item.tags.indexOf(_exclusion) > -1){
                            console.log(`Flag #1 - exclusion '${_exclusion}' found.`);
                            exclusionFound = true;
                            break;
                        }
                    }
                    if(exclusionFound){
                        break;
                    }
                }else{
                    if(item.tags.indexOf(exclusion) > -1){
                        console.log(`Flag #2 - exclusion '${exclusion}' found.`);
                        break;
                    }
                }
            }
        }
        //now throw out anything that lacks a required tag, if it doesn't fail any test, keep it
        if(qry.require.length > 0){
            for(let requirement of qry.require){
                if(Array.isArray(requirement)){
                    let requirementMissing = false;
                    for(let _requirement of requirement){
                        if(item.tags.indexOf(_requirement) < 0){
                            console.log(`Flag #3 - requirement '${_requirement}' not found.`);
                            requirementMissing = true;
                            break;
                        }
                    }
                    if(requirementMissing){
                        break;
                    }
                }else{
                    if(item.tags.indexOf(requirement) < 0){
                        console.log(`Flag #4 - requirement '${requirement}' not found.`);
                        break;
                    }
                }
            }
            results.push(item);
            break;
        }
        //finally, if it contains any included tags, keep it
        if(qry.include.length > 0){
            for(let inclusion of qry.include){
                if(Array.isArray(inclusion)){
                    let inclusionFound = false;
                    for(let _inclusion of inclusion){
                        if(item.tags.indexOf(_inclusion) > -1){
                            console.log(`Flag #5 - inclusion '${_inclusion}' not found.`);
                            inclusionFound = true;
                            results.push(item);
                            break;
                        }
                    }
                    if(inclusionFound){
                        break;
                    }
                }else{
                    if(item.tags.indexOf(inclusion) > -1){
                        console.log(`Flag #6 - inclusion '${inclusion}' not found.`);
                        results.push(item);
                        break;
                    }
                }
            }
        }
    }
    return results;
}
*/
function flattenQryParams(params){
    flat = {};
    for(let k in params){
        if(params[k].length > 0){
            let list = [];
            for(let item of params[k]){
                if(Array.isArray(item)){
                    for(let _item of item){
                        list.push(_item);
                    }
                }else{
                    list.push(item);
                }
            }
            flat[k] = list;
        }else{
            flat[k] = [];
        }
    }
    return flat;
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
                extractUniqueTags(item);
                vueApp.allMedia.push(item);
            }
        }
    )
}

function parseSearch(qry){
    let opTokens = ['+', '-', '!', '&', '(', ')', '|'];
    let opTokenDefs = {
        '+': 'include',
        '-': 'exclude',
        '!': 'exclude',
        '&': 'require',
        '|': 'include'
    };
    let seps = [' ', ','];
    let params = {
        include: [],
        exclude: [],
        require: []
    };
    let curOperator = '+';
    let curTerm = '';
    let grouping = [];
    let groupMode = false;
    let i = 0;

    qry = qry.split('');
    for(let char of qry){
        if(opTokens.indexOf(char) > -1){
            if(char === '('){
                groupMode = true;
            }else if(char === ')'){
                if(curTerm && curTerm.length > 0){
                    grouping.push(curTerm);
                }
                params[opTokenDefs[curOperator]].push(grouping);
                curTerm = '';
                grouping = [];
                groupMode = false;
            }else{
                curOperator = char;
            }
        }else if(seps.indexOf(char) > -1){
            if(curTerm && curTerm.length > 0){
                if(groupMode){
                    grouping.push(curTerm);
                }else{
                    params[opTokenDefs[curOperator]].push(curTerm);
                }
                curTerm = '';
            }
        }else{
            //not a special token or sep, must be part of the search terms
            curTerm += char;
            if(i === qry.length - 1){
                params[opTokenDefs[curOperator]].push(curTerm);
            }
        }
        i += 1;
    }
    return params;
}

function queryUserInput(){
    let qry = document.getElementById('tag-search').value;
    console.log(qry);
    let qryParams = parseSearch(qry);
    console.log(qryParams);
    let flatParams = flattenQryParams(qryParams);
    console.log(flatParams);
    let matchedItems = findMediaByTags(flatParams);
    console.log(matchedItems);
    vueApp.selectedMedia = matchedItems;
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
