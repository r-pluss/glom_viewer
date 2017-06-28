const remote = require('electron').remote;
const fs = require('fs');
const path = require('path');
const {app} = require('electron').remote;
const appDataPath = path.join(app.getPath('userData'), 'config.json');

const $http = createConnection();

const qryOperators = ['+', '-', '!', '&', '(', ')', '|'];
const qrySeparators = [','];
const qrySpecialCharacters = Array.prototype.concat(qryOperators, qrySeparators);


const devFlags = {
    useBulmaModal: false
};

window._devFlags = devFlags;

/*
Vue.config.keyCodes = {
    embiggen: [107, 187],
    unbiggen: [109, 189]
};
*/

const vueApp = new Vue({
    created: afterCreation,
    el: '#app-root',
    data: {
        allMedia: [],
        baseURL: undefined,
        mediaScale: 'small',
        mediaScales: ['small', 'medium', 'large', 'full'],
        selectedMedia: [],
        tagTester: undefined, // <-- not sure what that was supposed to be for...
        uniqueTags: []
    },
    methods: {
        embiggen: embiggen,
        getGlomSource: getGlomSource,
        manageMediaItem: manageMediaItem,
        mediaType: mediaType,
        openInBrowser: openInBrowser,
        queryUserInput: queryUserInput,
        showUserSettings: showUserSettings,
        unbiggen: unbiggen
    },
    mounted: start
});


//TODO:
//see https://github.com/asciidoctor/asciidoctor/issues/1301 to begin investigation into properly displaying svg


//strictly for debugging ease
window._$app = vueApp;

function addItemTagToServer(media_id, tag){
    $http({
        method: 'POST',
        url: '/add_tag',
        data: {
            media_id: media_id,
            tag: tag
        }
    }).then(function(response){
        console.log(response);
    });
}

function afterCreation(){
    registerGlobalEventHandlers();
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

function embiggen(){
    let pos = vueApp.mediaScales.indexOf(vueApp.mediaScale);
    if(pos < (vueApp.mediaScales.length - 1)){
        vueApp.mediaScale = vueApp.mediaScales[pos + 1];
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
                exclusionFound = true;
                break;
            }
        }
        for(let requirement of qry.require){
            if(item.tags.indexOf(requirement) < 0){
                requirementMissing = true;
                break;
            }
        }
        for(let inclusion of qry.include){
            if(item.tags.indexOf(inclusion) > -1){
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
            let elem = document.getElementById('current-user');
            elem.classList.remove('not-logged-in');
            elem.classList.add('logged-in');
            elem.innerHTML = usr;
            for(let item of response.data.media_list){
                extractUniqueTags(item);
                vueApp.allMedia.push(item);
            }
        }
    );
}

function manageMediaItem(item){
    let img = `<img src= "${vueApp.baseURL}/media/${item.filename}">`;
    let fileDetails = `<div>
        <table id= 'media-manager-table'>
            <tbody>
                <tr>
                    <td class= 'media-manager-table-label'>Filename:</td>
                    <td class= 'media-manager-table-value'>${item.filename}</td>
                    <td class= 'media-manager-table-label'>MimeType:</td>
                    <td class= 'media-manager-table-value'>${item.mime_type}</td>
                </tr>
                <tr>
                    <td class= 'media-manager-table-label'>Height:</td>
                    <td class= 'media-manager-table-value'>${item.height}</td>
                    <td class= 'media-manager-table-label'>Width:</td>
                    <td class= 'media-manager-table-value'>${item.width}</td>
                </tr>
            </tbody>
        </table>
    </div>`;
    let tagInput = `<div>
        <input id= 'media-manager-tags'/>
    </div>`;
    let html = `${img}${fileDetails}${tagInput}`;
    let lightBox = basicLightbox.create(html);
    lightBox.show(function(instance){
        let tInput = document.getElementById('media-manager-tags');
        tInput.value = item.tags.join(',');
        tInput.boundItem = item;
        //tagsInput(tagger); <-tags-input.js
        let tagger = new Tagify(tInput,
            {
                autocomplete: true,
                callbacks: {
                    add: function(e){
                        let item = document.getElementById('media-manager-tags').boundItem;
                        for(let chr of qrySpecialCharacters){
                            if(e.detail.value.indexOf(chr) > -1){
                                //do not add, tag contains an illegal character
                                let warnModal = document.createElement('div');
                                warnModal.id = 'illegal-tag-char-modal';
                                warnModal.classList.add('modal');
                                warnModal.classList.add('is-active');
                                warnModal.innerHTML = `<div class='modal-background'></div><div class='modal-content'><div class= 'notification is-warning'><button class= 'delete' id='illegal-tag-char-close-btn'></button>Tags may not contain '${chr}'</div></div></div>`;
                                document.body.append(warnModal);
                                let closeModal = function(){
                                    let el = document.getElementById('illegal-tag-char-modal');
                                    if(el){
                                        el.parentNode.removeChild(el);
                                    }
                                };
                                document.getElementById('illegal-tag-char-close-btn').addEventListener('click', closeModal);
                                window.setTimeout(closeModal, 3000);
                                return;
                            }
                        }
                        item.tags.push(e.detail.value);
                        addItemTagToServer(item.filename, e.detail.value);
                    },
                    remove: function(e){
                        let item = document.getElementById('media-manager-tags').boundItem;
                        let i = 0;
                        let matchedPositions = [];
                        for(let t of item.tags){
                            if(t === e.detail.value){
                                matchedPositions.push(i);
                            }
                            i++;
                        }
                        if(matchedPositions.length > 0){
                            matchedPositions.reverse(); //pretty sure iterative splicing should go from highest to lowest index position
                            for(let j of matchedPositions){
                                item.tags.splice(j, 1);
                            }
                            removeItemTagFromServer(item.filename, e.detail.value);
                        }
                    }
                },
                enforceWhitelist: false,
                suggestionsMinChars: 3,
                whitelist: vueApp.uniqueTags,
            }
        );
    });
}

function mediaType(item){
    if(item.media_type === 'image'){
        if(item.mime_type === 'image/svg+xml'){
            return 'svg';
        }else{
            return 'img';
        }
    }else if(item.media_type === 'video'){
        return 'video';
    }
}

function openInBrowser(glomItem){
    remote.shell.openExternal(`${vueApp.baseURL}/media/${glomItem.filename}`);
}

function parseSearch(qry){
    //let opTokens = ['+', '-', '!', '&', '(', ')', '|'];
    //changed to use file-namespaced const
    let opTokenDefs = {
        '+': 'include',
        '-': 'exclude',
        '!': 'exclude',
        '&': 'require',
        '|': 'include'
    };
    //let seps = [','];
    //changed to use file-namespaced const
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


    //handle a couple explicit special cases first
    if(
        (qry.trim() === '') ||
        (qry.trim().length === 1 && qrySpecialCharacters.indexOf(qry.trim()) > -1)
    ){
        //null input or invalid search terms should generate no results
        return null;
    }else if(qry === '*'){
        //shortcut for "all"
        return params;
    }
    qry = qry.split('');
    for(let char of qry){
        if(qryOperators.indexOf(char) > -1){
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
        }else if(qrySeparators.indexOf(char) > -1){
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
    let qryParams = parseSearch(qry);
    if(qryParams === null){
        vueApp.selectedMedia == [];
        return;
    }
    let flatParams = flattenQryParams(qryParams);
    let matchedItems = findMediaByTags(flatParams);
    vueApp.selectedMedia = matchedItems;
}

function registerGlobalEventHandlers(){
    window.addEventListener('keyup', function(e){
        if(e.ctrlKey && ['+', '-'].indexOf(e.key) > -1){
            if(e.key === '+'){
                embiggen();
            }else{
                unbiggen();
            }
        }
    });
}

function removeItemTagFromServer(media_id, tag){
    $http({
        method: 'POST',
        url: '/remove_tag',
        data: {
            media_id: media_id,
            tag: tag
        }
    }).then(function(response){
        console.log(response);
    });
}

function saveSettings(e){
    let conf = {
        hostname: document.getElementById('hostname').value,
        password: document.getElementById('userpassword').value,
        port: document.getElementById('hostport').value || null,
        username: document.getElementById('username').value
    };
    setConfig(conf);
    getUserMedia();
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

function start(){
    let config = getConfig();
    if(config.hostname && config.username && config.password){
        getUserMedia(config.username);
    }else{
        vueApp.showUserSettings();
    }
}

function unbiggen(){
    let pos = vueApp.mediaScales.indexOf(vueApp.mediaScale);
    if(pos > 0){
        vueApp.mediaScale = vueApp.mediaScales[pos - 1];
    }
}
