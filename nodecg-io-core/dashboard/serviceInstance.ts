/// <reference types="monaco-editor/monaco" />
import {
    CreateServiceInstanceMessage,
    DeleteServiceInstanceMessage,
    UpdateInstanceConfigMessage,
} from "nodecg-io-core/extension/messageManager";
import { updateOptionsArr, updateOptionsMap } from "./utils/selectUtils";
import { objectDeepCopy } from "./utils/deepCopy";
import { config, sendAuthenticatedMessage } from "./crypto";

const editorDefaultText = "<---- Select a service instance to start editing it in here";
const editorCreateText = "<---- Create a new service instance on the left and then you can edit it in here";

document.addEventListener("DOMContentLoaded", () => {
    config.onChange(() => {
        renderServices();
        renderInstances();
    });
});

// Inputs
const selectInstance = document.getElementById("selectInstance") as HTMLSelectElement;
const selectService = document.getElementById("selectService") as HTMLSelectElement;
const inputInstanceName = document.getElementById("inputInstanceName") as HTMLInputElement;

// Website areas
const instanceServiceSelector = document.getElementById("instanceServiceSelector");
const instanceNameField = document.getElementById("instanceNameField");
const instanceEditButtons = document.getElementById("instanceEditButtons");
const instanceCreateButton = document.getElementById("instanceCreateButton");
const instanceMonaco = document.getElementById("instanceMonaco");
let editor: monaco.editor.IStandaloneCodeEditor | undefined;

const spanInstanceNotice = document.getElementById("spanInstanceNotice");

// HTML Handlers

window.addEventListener("resize", () => {
    updateMonacoLayout();
});
export function updateMonacoLayout(): void {
    editor?.layout();
}

export function onMonacoReady(): void {
    if (instanceMonaco) {
        editor = monaco.editor.create(instanceMonaco, {
            theme: "vs-dark",
        });

        // Virtually selects the same instance option again to show the json/text in the editor.
        const selected = selectInstance.options[selectInstance.selectedIndex]?.value || "select";
        selectServiceInstance(selected);
    }
}

// Instance drop-down
export function onInstanceSelectChange(value: string): void {
    showError(undefined);
    switch (value) {
        case "new":
            editor?.updateOptions({
                readOnly: true,
            });
            editor?.setModel(monaco.editor.createModel(editorCreateText, "text"));
            setCreateInputs(true, false);
            inputInstanceName.value = "";
            break;
        case "select":
            editor?.updateOptions({
                readOnly: true,
            });
            editor?.setModel(monaco.editor.createModel(editorDefaultText, "text"));
            setCreateInputs(false, false);
            break;
        default:
            showConfig(value);
    }
}

function showConfig(value: string) {
    const inst = config.data?.instances[value];
    const service = config.data?.services.find((svc) => svc.serviceType === inst?.serviceType);

    editor?.updateOptions({
        readOnly: false,
    });

    // Get rid of old models, as they have to be unique and we may add the same again
    monaco.editor.getModels().forEach((m) => m.dispose());

    // This model uri can be completely made up as long the uri in the schema matches with the one in the language model.
    const modelUri = monaco.Uri.parse(`mem://nodecg-io/${inst?.serviceType}.json`);
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: service?.schema !== undefined,
        schemas:
            service?.schema !== undefined
                ? [
                      {
                          uri: modelUri.toString(),
                          fileMatch: [modelUri.toString()],
                          schema: objectDeepCopy(service?.schema),
                      },
                  ]
                : [],
    });
    const model = monaco.editor.createModel(JSON.stringify(inst?.config || {}, null, 4), "json", modelUri);
    editor?.setModel(model);
    setCreateInputs(false, true);
}

// Save button
export async function saveInstanceConfig(): Promise<void> {
    if (editor === undefined) {
        return;
    }
    showError(undefined);

    try {
        const instName = selectInstance.options[selectInstance.selectedIndex]?.value;
        const config = JSON.parse(editor.getValue());
        const msg: Partial<UpdateInstanceConfigMessage> = {
            config: config,
            instanceName: instName,
        };
        await sendAuthenticatedMessage("updateInstanceConfig", msg);
    } catch (err) {
        console.log(err);
        showError(err);
    }
}

// Delete button
export async function deleteInstance(): Promise<void> {
    const msg: Partial<DeleteServiceInstanceMessage> = {
        instanceName: selectInstance.options[selectInstance.selectedIndex]?.value,
    };

    const deleted = await sendAuthenticatedMessage("deleteServiceInstance", msg);
    if (deleted) {
        selectServiceInstance("select");
    } else {
        console.log(`Couldn't delete the instance "${msg.instanceName}" for some reason, please check the nodecg log`);
    }
}

// Create button
export async function createInstance(): Promise<void> {
    showError(undefined);
    const service = selectService.options[selectService.options.selectedIndex]?.value;
    const name = inputInstanceName.value;

    const msg: Partial<CreateServiceInstanceMessage> = {
        serviceType: service,
        instanceName: name,
    };

    try {
        await sendAuthenticatedMessage("createServiceInstance", msg);
    } catch (e) {
        showError(e);
        return;
    }

    // Give the browser some time to create the new instance select option and to add them to the DOM
    setTimeout(() => {
        selectServiceInstance(name);
    }, 250);
}

// Render functions of Replicants

function renderServices() {
    if (!config.data) {
        return;
    }
    updateOptionsArr(
        selectService,
        config.data.services.map((svc) => svc.serviceType),
    );
}

function renderInstances() {
    if (!config.data) {
        return;
    }

    const previousSelected = selectInstance.options[selectInstance.selectedIndex]?.value || "select";

    // Render instances
    updateOptionsMap(selectInstance, config.data.instances);

    // Add new and select options
    const selectOption = document.createElement("option");
    selectOption.innerText = "Select...";
    selectOption.value = "select";
    selectInstance.prepend(selectOption);

    const newOption = document.createElement("option");
    newOption.innerText = "New...";
    newOption.value = "new";
    selectInstance.options.add(newOption);

    // Restore previous selection
    selectServiceInstance(previousSelected);
}

// Util functions

function selectServiceInstance(instanceName: string) {
    for (let i = 0; i < selectInstance.options.length; i++) {
        const opt = selectInstance.options[i];
        if (opt?.value === instanceName) {
            // If already selected a re-render monaco is not needed
            if (selectInstance.selectedIndex !== i) {
                selectInstance.selectedIndex = i;
                onInstanceSelectChange(instanceName);
            }
            break;
        }
    }
}

// Hides/unhides parts of the website based on the passed parameters
function setCreateInputs(createMode: boolean, instanceSelected: boolean) {
    function setVisible(node: HTMLElement | null, visible: boolean) {
        if (visible && node?.classList.contains("hidden")) {
            node?.classList.remove("hidden");
        } else if (!visible && !node?.classList.contains("hidden")) {
            node?.classList.add("hidden");
        }
    }

    setVisible(instanceEditButtons, !createMode && instanceSelected);
    setVisible(instanceCreateButton, createMode);
    setVisible(instanceNameField, createMode);
    setVisible(instanceServiceSelector, createMode);
}

export function showError(msg: string | undefined): void {
    if (spanInstanceNotice !== null) {
        spanInstanceNotice.innerText = msg !== undefined ? msg : "";
    }
}
