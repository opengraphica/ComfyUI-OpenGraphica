const { app } = window.comfyAPI.app;
const { api } = window.comfyAPI.api;
const { ComfyDialog, $el } = window.comfyAPI.ui;

import { ComfyApp } from '../../scripts/app.js';
import OpenGraphica from '/opengraphica/main.mjs';

function addMenuHandler(nodeType, callback) {
    const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function () {
        const originalReturn = getExtraMenuOptions.apply(this, arguments);
        callback.apply(this, arguments);
        return originalReturn;
    };
}

async function getNodeImageBlob(node) {
    const src = node.imgs?.[0]?.src;
    if (!src) throw new Error('This node has no rendered image preview.');
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Could not fetch preview: ${response.status}`);
    return response.blob();
}

async function uploadEditedImage(blob) {
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const file = new File([blob], `OpenGraphica-${Date.now()}.${ext}`, {
        type: blob.type || 'image/png',
    });
    const form = new FormData();
    form.append('image', file);
    form.append('type', 'input');
    form.append('overwrite', 'true');
    const response = await api.fetchApi('/upload/image', {
        method: 'POST',
        body: form,
    });
    if (!response.ok) throw new Error(`Image upload failed: ${response.status}`);
    return response.json();
}

async function saveNodeImageBlob(node, blob) {
    const uploaded = await uploadEditedImage(blob);
    const imageWidget = node.widgets?.find((widget) => widget.name === 'image');
    if (!imageWidget) {
        throw new Error(
            'No editable \'image\' widget on this node; its computed output cannot be replaced directly.'
        );
    }
    imageWidget.value = uploaded.name;
    imageWidget.callback?.(uploaded.name);
    app.graph.setDirtyCanvas(true, true);
}

let dialog = null;
let editingDialogNode = null;

async function openDialog(node) {
    editingDialogNode = node;
    const imageBlob = await getNodeImageBlob(editingDialogNode);

    function stopPropagationHandler(event) {
        event.stopPropagation();
    }
    const vueApp = document.getElementById('vue-app');
    if (vueApp) {
        vueApp.style.display = 'none';
    }

    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.style.cssText = 'position:fixed;left:1rem;width:calc(100dvw - 2rem);top:4rem;height:calc(100dvh - 5rem);padding:0;margin:0;border:0;border-radius:0.5rem;overflow:visible;';
        const editorHost = document.createElement('div');
        editorHost.style.cssText = 'display:flex;width:100%;height:100%;align-items:stretch;justify-content:stretch;border-radius:0.5rem;overflow:hidden;';
        dialog.append(editorHost);
        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;position:absolute;top:-3rem;left:50%;transform:translateX(-50%);gap:0.75rem';
        dialog.append(buttons);
        const cancelButton = document.createElement('button');
        cancelButton.style.cssText = 'display:inline-flex;align-items:center;gap:0.25rem;background:transparent;color:#ccc;border:1px solid #ccc;border-radius:0.375rem;padding:0.5rem 1rem;line-height:1.2;cursor:pointer';
        cancelButton.innerHTML = '<i class="pi pi-times"></i> Cancel';
        cancelButton.addEventListener('click', cancelDialog);
        buttons.append(cancelButton);
        const saveButton = document.createElement('button');
        saveButton.style.cssText = 'display:inline-flex;align-items:center;gap:0.25rem;background:transparent;color:#009cff;border:1px solid #009cff;border-radius:0.375rem;padding:0.5rem 1rem;line-height:1.2;cursor:pointer';
        saveButton.innerHTML = '<i class="pi pi-check"></i> Save';
        saveButton.addEventListener('click', saveDialog);
        buttons.append(saveButton);
        document.body.append(dialog);

        dialog.showModal();

        window.OpenGraphica = OpenGraphica;
        OpenGraphica.emit('store.setPreference', { key: 'assetsBasePath', value: '/opengraphica/' });
        OpenGraphica.emit('store.setPreference', { key: 'showWelcomeScreenAtStart', value: false })
        OpenGraphica.emit('store.setPreference', {
            key: 'vendorCustomSaveCallback',
            value: () => {
                OpenGraphica.emit('app.runModule', {
                    action: {
                        type: 'function',
                        target: 'file/export.exportAsImage',
                    },
                    props: {
                        fileType: 'png',
                        toBlob: true,
                    },
                    onSuccess: saveCallback,
                    onError: errorCallback,
                });
            },
        });
        OpenGraphica.mount(editorHost);
        OpenGraphica.theme({
            dark: '/opengraphica/css/main-dark.css'
        });
        OpenGraphica.on('app.canvas.ready', () => {
            OpenGraphica.emit('app.runModule', {
                action: {
                    type: 'function',
                    target: 'file/open.openFromFileList',
                },
                props: {
                    files: [
                        new File([imageBlob], 'Image', { type: imageBlob.type }),
                    ],
                },
            });
        });

        async function saveCallback({ blob }) {
            try {
                await saveNodeImageBlob(editingDialogNode, blob);
            } catch (error) {
                console.error(error);
                errorCallback(error);
            }
            await OpenGraphica.theme({});
            dialog.close();
        }
        function errorCallback(error) {
            alert('An error occurred while saving the image.', error);
        }
        async function saveDialog() {
            OpenGraphica.emit('app.runModule', {
                action: {
                    type: 'function',
                    target: 'file/export.exportAsImage',
                },
                props: {
                    fileType: 'png',
                    toBlob: true,
                },
                onSuccess: saveCallback,
                onError: errorCallback,
            });
        }
        async function cancelDialog() {
            await OpenGraphica.theme({});
            dialog.close();
        }

        dialog.addEventListener('close', () => {
            vueApp.style.display = '';
        });
    } else {
        OpenGraphica.emit('app.preload.show');
        await OpenGraphica.theme({
            dark: '/opengraphica/css/main-dark.css'
        });

        dialog.showModal();

        OpenGraphica.emit('app.runModule', {
            action: {
                type: 'function',
                target: 'file/open.openFromFileList',
            },
            props: {
                files: [
                    new File([imageBlob], 'Image', { type: imageBlob.type }),
                ],
            },
        });

        // Cover up visual flashing
        setTimeout(() => {
            OpenGraphica.emit('app.preload.hide');
        }, 400);
    }
}

app.registerExtension({
    name: 'OpenGraphica.PhotoEditor',
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (Array.isArray(nodeData.output) && (nodeData.output.includes('MASK') || nodeData.output.includes('IMAGE'))) {
            addMenuHandler(nodeType, function (_, options) {
                const node = this;
                options.unshift({
                    content: 'Open in OpenGraphica Editor',
                    callback: () => {
                        openDialog(node).catch(error => console.error(error));
                    },
                });
            });
        }
    }
});
