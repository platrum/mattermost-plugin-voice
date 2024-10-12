import request from 'superagent';
import {Client4} from 'mattermost-redux/client';

import {getPluginURL} from '../utils.js';

import Recorder from './recorder.js';

export default class Client {
    constructor() {
        this._onUpdate = null;
        this.timerID = null;
        this.recorder = new Recorder({
            workerURL: `${getPluginURL()}/public/recorder.worker.js`,
        });
        request.get(`${getPluginURL()}/config`).accept('application/json').then((res) => {
            this.recorder.init({
                maxDuration: parseInt(res.body.VoiceMaxDuration, 10),
                bitRate: parseInt(res.body.VoiceAudioBitrate, 10),
            }).then(() => {
                // console.log('client: recorder initialized');
            });
        });
        this.recorder.on('maxduration', () => {
            if (this.timerID) {
                clearInterval(this.timerID);
            }
            this.recorder.stop().then((recording) => {
                this._recording = recording;
                if (this._onUpdate) {
                    this._onUpdate(0);
                }
            });
        });
    }

    startRecording(channelId, rootId) {
        // console.log('client: start recording');
        this.channelId = channelId || null;
        this.rootId = rootId || null;
        this._recording = null;
        return this.recorder.start().then(() => {
            this.timerID = setInterval(() => {
                if (this._onUpdate && this.recorder.startTime) {
                    this._onUpdate(new Date().getTime() - this.recorder.startTime);
                }
            }, 200);
        });
    }

    stopRecording() {
        // console.log('client: stop recording');
        if (this.timerID) {
            clearInterval(this.timerID);
        }
        this._onUpdate = null;
        return this.recorder.stop();
    }

    cancelRecording() {
        // console.log('client: cancel recording');
        if (this.timerID) {
            clearInterval(this.timerID);
        }
        this._onUpdate = null;
        return this.recorder.cancel();
    }

    _sendRecording({channelId, rootId, recording}) {
        const recordFilename = `${Date.now() - recording.duration}.mp3`;

        const saveToLocalStorage = (filename, file) => {
            if (!localStorage.getItem(filename)) {
                blobToBase64(file).then(base64 => {
                    localStorage.setItem(filename, base64);
                });
            }
        };

        const removeFromLocalStorage = (filename) => {
            localStorage.removeItem(filename);
        };

        const getFromLocalStorage = (filename) => {
            const base64Data = localStorage.getItem(filename);
            return base64Data ? base64ToBlob(base64Data) : null;
        };

        const blobToBase64 = (blob) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result.split(',')[1]); // Возвращаем Base64 без `data:audio/mp3;base64,`
                };
                reader.readAsDataURL(blob);
            });
        };

        const base64ToBlob = (base64) => {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], {type: 'audio/mp3'});
        };

        const postAudioFile = (fileToSend) => {
            return request.post(Client4.getFilesRoute()).
                set(Client4.getOptions({method: 'post'}).headers).
                attach('files', fileToSend, recordFilename).
                field('channel_id', channelId).
                accept('application/json').
                then(res => res.body.file_infos[0].id).
                catch(error => {
                    throw new Error('Error uploading file: ' + error.message);
                });
        };

        const postMessage = (fileId) => {
            const messageData = {
                channel_id: channelId,
                root_id: rootId,
                message: 'Voice Message',
                type: 'custom_voice',
                props: {
                    fileId: fileId,
                    duration: recording.duration,
                },
            };

            return request.post(Client4.getPostsRoute()).
                set(Client4.getOptions({method: 'post'}).headers).
                send(messageData).
                accept('application/json').
                catch(error => {
                    throw new Error('Error posting message: ' + error.message);
                });
        };

        const fileKey = `audioFile_${recordFilename}`;

        // Сохраняем запись в localStorage перед отправкой
        saveToLocalStorage(fileKey, recording.blob);

        const fileToSend = getFromLocalStorage(fileKey) || recording.blob;

        let attempt = 0;
        const maxAttempts = 30;

        const performRequest = () => {
            return postAudioFile(fileToSend).
                then((fileId) => {
                    removeFromLocalStorage(fileKey);
                    return postMessage(fileId);
                }).
                catch((error) => {
                    if (attempt < maxAttempts - 1) {
                        attempt++;
                        return new Promise((resolve, reject) => {
                            setTimeout(() => {
                                performRequest().
                                    then(resolve).
                                    catch(reject);
                            }, 5000 * attempt);
                        });
                    } else {
                        removeFromLocalStorage(fileKey);
                        throw error;
                    }
                });
        };

        return performRequest();
    }

    sendRecording(channelId, rootId) {
        if (!this.channelId && !channelId) {
            return Promise.reject(new Error('channel id is required'));
        }
        const cId = this.channelId ? this.channelId : channelId;
        const rId = !this.channelId && rootId ? rootId : this.rootId;
        // console.log('client: send recording');
        if (this._recording) {
            return this._sendRecording({
                channelId: cId,
                rootId: rId,
                recording: this._recording,
            });
        }
        return this.recorder.stop().then((res) => {
            return this._sendRecording({
                channelId: cId,
                rootId: rId,
                recording: res,
            });
        });
    }

    on(type, cb) {
        if (type === 'update') {
            this._onUpdate = cb;
        }
    }
}
