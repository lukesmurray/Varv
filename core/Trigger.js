/**
 *  Trigger - Superclass for all triggers
 * 
 *  This code is licensed under the MIT License (MIT).
 *  
 *  Copyright 2020, 2021, 2022 Rolf Bagge, Janus B. Kristensen, CAVI,
 *  Center for Advanced Visualization and Interaction, Aarhus University
 *  
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the “Software”), to deal
 *  in the Software without restriction, including without limitation the rights 
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell 
 *  copies of the Software, and to permit persons to whom the Software is 
 *  furnished to do so, subject to the following conditions:
 *  
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *  
 *  THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
 *  THE SOFTWARE.
 *  
 */

const VarvEventPrefix = "VarvEvent.";
let triggeringEnabled = true;

class Trigger {
    /**
     * Create a new trigger
     * @param {string} name - The name of this trigger
     * @param {object|string} options - The options of this trigger
     * @param {Concept} concept - The owning concept of this trigger
     */
    constructor(name, options, concept) {
        this.options = options;
        this.name = name;
        this.concept = concept;
    }

    /**
     * Destroy this trigger
     * @param {Concept} concept - The concept this trigger is registered on
     */
    destroy() {
        //Default implementation just disabled the trigger
        this.disable();
    }

    /**
     * Enable this trigger
     */
    enable() {
        console.warn("Always override Trigger.enable in subclass!");
    }

    /**
     * Disable this trigger
     */
    disable() {
        console.warn("Always override Trigger.disable in subclass!");
    }

    /**
     * Register a new type of trigger
     * @param {string} type - The type of trigger to register
     * @param {Trigger} trigger - The trigger to register
     */
    static registerTrigger(type, trigger) {
        Trigger.triggers.set(type, trigger);
    }

    /**
     * Create a new named instance of the given trigger type, using the given options
     * @param {string} type - The type of trigger to create
     * @param {string} name - The name to give the trigger
     * @param {object} options - The options to pass along to the trigger
     * @returns {Trigger} - The newly created trigger
     */
    static getTrigger(type, name, options) {
        let triggerClass = Trigger.triggers.get(type);

        if (triggerClass == null) {
            throw new Error("Unknown trigger [" + type + "]");
        }

        return new triggerClass(name, options);
    }

    static registerTriggerEvent(triggerName, callback) {
        return EventSystem.registerEventCallback(VarvEventPrefix+triggerName, async (evt)=>{
            let contexts = Action.clone(evt.detail);

            await callback(contexts);
        });
    }

    static async trigger(triggerName, context) {
        if(!triggeringEnabled) {
            if(Trigger.DEBUG) {
                console.log("Skipping (Triggering Disabled):", triggerName, context);
            }
            return;
        }

        if(!Array.isArray(context)) {
            context = [context];
        }

        if(Trigger.DEBUG) {
            console.group("Triggering:", triggerName, Action.clone(context));
        }

        await EventSystem.triggerEventAsync(VarvEventPrefix+triggerName, context);

        if(Trigger.DEBUG) {
            console.groupEnd();
        }
    }

    static async runWithoutTriggers(method) {
        triggeringEnabled = false;
        await method();
        triggeringEnabled = true;
    }
}
Trigger.DEBUG = false;
Trigger.triggers = new Map();
window.Trigger = Trigger;
