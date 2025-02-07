/**
 *  ContextActions - Actions that manipulate the context
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

// gate(filter) // filter context
// gate(filter... or=[])

/**
 * An action "select" that selects a number of concepts of the given type, optionally filtered by a where condition
 * <br />
 * Options:
 * <ul>
 * <li>concept: The concept to select</li>
 * <li>property: Select the concepts this property holds</li>
 * <li>target: The specific uuid to select</li>
 * <li>as: The variable name to save the selection as</li>
 * <li>where: A filter spec for filtering on the selection</li>
 * <li>forEach (false): If true the select action is run 1 time for each currently selected concept</li>
 * <li>stopIfEmpty (false): If true, the action chain stops if nothing is selected</li>
 * </ul>
 *
 * @example
 * //Select all concepts of a type
 * {
 *     "select": {
 *         "concept": "myConceptType"
 *     }
 * }
 *
 * @example
 * //Select all concepts of a type, and save the selected uuids in the variable $mySelection
 * {
 *     "select": {
 *         "concept": "myConceptType",
 *         "as": "mySelection"
 *     }
 * }
 *
 * @example
 * //Select all concepts of a type (Shorthand version)
 * {
 *     "select": "myConceptType"
 * }
 *
 * @example
 * //Select concept with given uuid
 * {
 *     "select": {
 *         "target": "someuuid"  //Can also be an array: "target": ["uuid1", "uuid2"]
 *     }
 * }
 *
 * @example
 * //Select concept saved in variable, shorthand
 * {
 *     "select": "$myConceptVariable"
 * }
 *
 * @example
 * //Select all concepts of a type, filtering for some property. (Also supports "or", "and" and "not" inside the where clause)
 * {
 *     "select": {
 *         "concept": "myConceptType",
 *         "where": {
 *             "property": "color",
 *             "equals": "yellow"
 *         }
 *     }
 * }
 *
 * @example
 * //Select all concepts of a type, filtering using a calculation
 * {
 *     "select": {
 *         "concept": "myConceptType",
 *         "where": {
 *             "calculate": "$myConceptType.myProperty$ + 10",
 *             "equals": "15"
 *         }
 *     }
 * }
 *
 * @example
 * //Select all concepts of a type, filtering using lastTarget (only available in forEach)
 * {
 *     "select": {
 *         "concept": "myConceptType",
 *         "where": {
 *             "property": "myConceptType.uuid",
 *             "equals": "lastTarget.uuid$"
 *         },
 *         "forEach": true
 *     }
 * }
 */
class SelectAction extends Action {
    static options() {
        return {
            "$selectType": "enumValue[concept,property,variable]",
            "where": "filter",
            "as": "@string",
            "forEach": "boolean%false",
            "stopIfEmpty": "boolean%false"
        };
    }

    constructor(name, options, concept) {
        //Handle shorthand
        if(typeof options === "string") {
            if(options.trim().startsWith("$")) {
                options = {
                    target: options
                }
            } else {
                options = {
                    concept: options
                }
            }
        }

        const defaultOptions = {
            forEach: false,
            stopIfEmpty: false
        };

        options = Object.assign({}, defaultOptions, options);

        let wherePart = options.where;
        delete options.where;

        super(name, options, concept);

        this.wherePart = wherePart;
    }

    async apply(contexts, actionArguments) {
        const self = this;

        async function doSelect(context, options, originalOptions) {

            let conceptUUIDs = [];

            if(options.concept != null) {
                conceptUUIDs = VarvEngine.getAllUUIDsFromType(options.concept, true);
            } else if(options.target != null) {
                if (Array.isArray(options.target)) {
                    conceptUUIDs.push(...options.target);
                } else {
                    conceptUUIDs.push(options.target);
                }
            } else if(options.property != null) {
                let lookup = VarvEngine.lookupProperty(context.target, self.concept, options.property);

                if(lookup == null) {
                    throw new Error("No property ["+options.property+"] found!");
                }

                if(lookup.property.isConceptType()) {
                    let value = await lookup.property.getValue(lookup.target)
                    conceptUUIDs.push(value);
                } else if(lookup.property.isConceptArrayType()) {
                    let value = await lookup.property.getValue(lookup.target)
                    conceptUUIDs.push(...value);
                } else {
                    throw new Error("Only able to select properties that are of concept or concept array type: ["+options.property+":"+lookup.property.type+"]");
                }

            } else {
                throw new Error("Missing option 'concept' or 'target' on select action");
            }

            let filteredUUIDs = [];

            for(let uuid of conceptUUIDs) {
                if(self.wherePart != null) {
                    let clonedVariables = Object.assign({}, context.variables);

                    let filterContext = {target: uuid, lastTarget: context.target, variables: clonedVariables};

                    let lookupWhereWithArguments = await Action.lookupArguments(self.wherePart, actionArguments);

                    let lookupWhereOptions = await Action.lookupVariables(lookupWhereWithArguments, filterContext);

                    let filter = await FilterAction.constructFilter(lookupWhereOptions);

                    if(await filter.filter(filterContext, self.concept)) {
                        filteredUUIDs.push(uuid);
                    }
                } else {
                    filteredUUIDs.push(uuid);
                }
            }

            if(options.as) {
                Action.setVariable(context, options.as, filteredUUIDs);
            }

            return filteredUUIDs.map((uuid)=>{
                // Turn into context
                return Object.assign({}, context, {target: uuid});
            });
        }

        let result = [];

        let optionsWithArguments = await Action.lookupArguments(this.options, actionArguments);

        if(optionsWithArguments.forEach) {
            //Individual mode
            result = await this.forEachContext(contexts, actionArguments,async (context, options)=>{
                return await doSelect(context, options, optionsWithArguments);
            });
        } else {
            //Bulk mode

            //Find any common variables and keep
            let commonVariables = Action.getCommonVariables(contexts);

            let commonTarget = -1;

            contexts.forEach((context)=>{
                if(commonTarget === -1) {
                    commonTarget = context.target;
                } else {
                    if(commonTarget !== context.target) {
                        commonTarget = null;
                    }
                }
            });

            let optionsWithVariablesAndArguments = await Action.lookupVariables(optionsWithArguments, {target: commonTarget, variables: commonVariables});

            result = await doSelect({target: null, variables: commonVariables}, optionsWithVariablesAndArguments, optionsWithArguments);
        }

        if(optionsWithArguments.stopIfEmpty && result.length === 0) {
            throw new StopError("Action '"+self.name+"' had no output, and 'stopIfEmpty' was set!");
        }

        return result;
    }
}
Action.registerPrimitiveAction("select", SelectAction);
window.SelectAction = SelectAction;

/**
 * An action 'storeSelection' that stores the current concept selection as a variable
 *
 * @example
 * {
 *     "storeSelection": {
 *         "as": "mySelectionVariableName"
 *     }
 * }
 *
 * @example
 * //Shorthand
 * {
 *     "storeSelection": "mySelectionVariableName"
 * }
 */
class StoreSelectionAction extends Action {
    static options() {
        return {
            "as": "@string"
        };
    }

    constructor(name, options, concept) {

        if(typeof options === "string") {
            options = {
                "as": options
            };
        }

        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        let uuids = contexts.filter((context)=>{
            return context.target != null;
        }).map((context)=>{
            return context.target;
        });

        let variableName = Action.defaultVariableName(this);

        let optionsWithArguments = await Action.lookupArguments(this.options, actionArguments);

        let commonVariables = Action.getCommonVariables(contexts);
        let optionsWithVariablesAndArguments = await Action.lookupVariables(optionsWithArguments, {variables: commonVariables});

        if(optionsWithVariablesAndArguments.as) {
            variableName = optionsWithVariablesAndArguments.as;
        }

        contexts.forEach((context)=>{
            Action.setVariable(context, variableName, uuids.slice());
        })

        return contexts;
    }
}
Action.registerPrimitiveAction("storeSelection", StoreSelectionAction);
window.StoreSelectionAction = StoreSelectionAction;

/**
 * An action "limit" that limits the current selected concepts to a given count, starting from first or last
 *
 * @example
 * //Limit concepts to 1, starting from first
 * {
 *     "limit": {
 *         "count": 1,
 *         "last": false
 *     }
 * }
 *
 * @example
 * //Limit concepts to 1, starting from first (shorthand version)
 * {
 *     "limit": 1
 * }
 *
 * @example
 * //Limit concepts to 2, starting from last
 * {
 *     "limit": {
 *         "count": 2,
 *         "last": true
 *     }
 * }
 */
class LimitAction extends Action {
    static options() {
        return {
            "count": "number",
            "last": "boolean%false"
        };
    }

    constructor(name, options, concept) {
        //Shorthand
        if(typeof options === "number") {
            options = {
                count: options
            }
        }

        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        return this.forEachContext(contexts, actionArguments, (context, options, index)=>{
            if(options.count == null) {
                throw new Error("Missing option 'count' on action 'limit'");
            }

            if(options.last === true) {
                //Allow the last "count" elements through
                if(index >= contexts.length - options.count) {
                    return context;
                }
            } else {
                //Allow the first "count" elements through
                if(index <= options.count-1) {
                    return context;
                }
            }
        });
    }
}
Action.registerPrimitiveAction("limit", LimitAction);
window.LimitAction = LimitAction;

/**
 * An action "where" that filters on the currently selected concepts
 *
 * If the option "stopIfEmpty" is set to true, the action chain will terminate after the where action, if no concepts
 * survived the filtering.
 * <p>
 * Available operators for property/variable/value filter:
 * </p>
 *
 * <ul>
 * <li>"equals" - "number", "boolean", "string", "concept"</li>
 * <li>"unequals" - "number", "boolean", "string", "concept"</li>
 * <li>"greaterThan" - "number", "string"</li>
 * <li>"lessThan" - "number", "string"</li>
 * <li>"greaterOrEquals" - "number", "string"</li>
 * <li>"lessOrEquals" - "number", "string"</li>
 * <li>"startsWith" - "string"</li>
 * <li>"endsWith" - "string"</li>
 * <li>"includes" - "string", "array"</li>
 * <li>"matches" - "string"</li>
 * </ul>
 *
 * @example
 * {
 *     "where": {
 *         "or": [
 *             {
 *                 "calculate": "10 + $myVariable$",
 *                 "equals": 15
 *             },
 *             {
 *                 "not": {
 *                     "variable": "myVariableName",
 *                     "equals": "myVariableValue"
 *                 }
 *             },
 *             {
 *                 "not": {
 *                     "property": "myProperty",
 *                     "equals": "myPropertyValue"
 *                 }
 *             },
 *             {
 *                 "and": [
 *                     {
 *                         "property": "myOtherProperty",
 *                         "unequals": "somethingelse"
 *                     },
 *                     {
 *                         "property": "myThirdProperty",
 *                         "lowerThan": 10
 *                     }
 *                 ]
 *             }
 *         ]
 *     }
 * }
 */
class FilterAction extends Action {
    static options() {
        return {
            "$where": "filter",
            "stopIfEmpty": "boolean%false"
        };
    }
    constructor(name, options, concept) {
        const defaultOptions = {
            stopIfEmpty: false
        };

        options = Object.assign({}, defaultOptions, options);

        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;

        let result = await this.forEachContext(contexts, actionArguments, async (context, options)=>{
            try {
                let filter = FilterAction.constructFilter(options);

                let shouldKeep = await filter.filter(context, this.concept);

                if (shouldKeep) {
                    return context;
                }
            } catch(e) {
                console.error(e);
            }

            return null;
        });

        let optionsWithArguments = await Action.lookupArguments(this.options, actionArguments);

        if(optionsWithArguments.stopIfEmpty && result.length === 0) {
            throw new StopError("Action '"+self.name+"' had no output, and 'stopIfEmpty' was set!");
        }

        return result;
    }

    static constructFilter(options) {
        function hasOperator(options) {
            let found = false;
            Object.keys(FilterOps).forEach((op) => {
                if(options[op] != null) {
                    found = true;
                }
            });
            return found;
        }

        try {
            if (hasOperator(options)) {
                let operator = null;
                let value = null;

                Object.keys(FilterOps).forEach((op) => {
                    if (options[op] != null) {
                        if (operator != null) {
                            console.warn("Already set an operator for this property filter:", options);
                        }

                        operator = op;
                        value = options[op];
                    }
                });

                if(options.calculation != null) {
                    //Property defined, this is a property filter
                    return new FilterCalc(options.calculation, operator, value);
                }

                if(options.property != null) {
                    //Property defined, this is a property filter
                    return new FilterProperty(options.property, operator, value);
                }

                if(options.variable != null) {
                    //Variable defined, this is a variable filter
                    return new FilterVariable(options.variable, operator, value);
                }

                return new FilterValue(operator, value);
            } else {
                //This should be an "and", "or", "not" or concept filter filter

                if(options.concept != null) {
                    //Concept defined, this is a concept filter
                    return new FilterConcept(options.concept);
                }

                if (options.or != null) {
                    let orFilters = [];

                    options.or.forEach((filterOptions) => {
                        orFilters.push(FilterAction.constructFilter(filterOptions));
                    });

                    return new FilterOr(orFilters);
                } else if (options.and != null) {
                    let andFilters = [];

                    options.and.forEach((filterOptions) => {
                        andFilters.push(FilterAction.constructFilter(filterOptions));
                    });

                    return new FilterAnd(andFilters);
                } else if (options.not != null) {
                    return new FilterNot(FilterAction.constructFilter(options.not));
                }
            }
        } catch(e) {
            console.error(e);
        }

        console.warn("No filter constructed:", options);

        return null;
    }
}
Action.registerPrimitiveAction("where", FilterAction);
window.FilterAction = FilterAction;

/**
 * An action "new" that creates a new concept, optionally setting properties on it as well
 *
 * @example
 * {
 *      "new": {
 *          "concept": "myConcept",
 *          "with": {
 *              "myFirstProperty": "someValue",
 *              "mySecondProperty": false
 *              "myThirdProperty": "$myVariableName"
 *          }
 *      }
 * }
 *
 * @example
 * //Same as other example, but don't change the current selection, which means that the newly created concept is only passed along as a variable
 * {
 *      "new": {
 *          "concept": "myConcept",
 *          "with": {
 *              "myFirstProperty": "someValue",
 *              "mySecondProperty": false
 *              "myThirdProperty": "$myVariableName"
 *          },
 *          "as": "myVariableName",
 *          "select": false
 *      }
 * }
 */
class NewAction extends Action {
    static options() {
        return {
            "concept": "string",
            "with": "propertyList",
            "as": "@string",
            "select": "boolean%true"
        }
    }
    constructor(name, options, concept) {
        //Shorthand
        if(typeof options === "string") {
            options = {
                concept: options
            }
        }

        const defaultOptions = {
            select: true,
            forEach: false
        };

        super(name, Object.assign({}, defaultOptions, options), concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;

        async function doNew(context, options) {
            let concept = VarvEngine.getConceptFromType(options.concept);

            let uuid = await concept.create(null, options.with);

            let variableName = Action.defaultVariableName(self);

            if (options.as != null) {
                variableName = options.as;
            }

            Action.setVariable(context, variableName, uuid);

            if(options.select) {
                context.target = uuid;
            }

            return context;
        }

        let optionsWithArguments = await Action.lookupArguments(this.options, actionArguments);

        let result = [];

        if(optionsWithArguments.forEach) {
            result = await this.forEachContext(contexts, actionArguments, async (context, options) => {
                return await doNew(context, options);
            });
        } else {
            //Bulk mode

            //Find any common variables and keep
            let commonVariables = Action.getCommonVariables(contexts);

            let optionsWithVariablesAndArguments = await Action.lookupVariables(optionsWithArguments, {variables: commonVariables});

            result = [await doNew({variables: commonVariables}, optionsWithVariablesAndArguments)];
        }

        return result;
    }
}
Action.registerPrimitiveAction("new", NewAction);
window.NewAction = NewAction;

/**
 * An action "remove" that removes a concept from the state
 *
 * @example
 * //Remove the current context target
 * {
 *     "remove"
 * }
 *
 * @example
 * // Remove the concept or concepts (if variable points to an array) that the variable holds
 * {
 *     "remove": "$someVariable"
 * }
 */
class RemoveAction extends Action {
    static options() {
        return {
            "target": "@string"
        };
    }

    constructor(name, options, concept) {
        if(typeof options === "string") {
            options = {
                target: options
            }
        }
        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        return this.forEachContext(contexts, actionArguments, async (context, options)=>{

            let removeUuids = options.target;

            if(removeUuids == null) {
                if(context.target == null) {
                    throw new Error("No uuid's supplied to be removed, and context.target is non existant");
                }

                //No remove option specified, remove current target
                removeUuids = context.target;

                context.target = null;
            }

            if(!Array.isArray(removeUuids)) {
                removeUuids = [removeUuids];
            }

            for(let uuid of removeUuids) {
                await VarvEngine.getConceptFromUUID(uuid).delete(uuid);
            }

            //Return null, to signal that this target/context is now invalid.
            return null;
        });
    }
}
Action.registerPrimitiveAction("remove", RemoveAction);
window.RemoveAction = RemoveAction;

/**
 * An action "eval" that takes a filter, and sets a variable to true/false, depending on if the filter matched or not
 *
 * @example
 * {
 *     "eval": {
 *         "and": [
 *             { "property": "myFirstProperty", "equals": false },
 *             { "property": "mySecondProperty", "equals": false }
 *         ]
 *     }
 * }
 */
class EvalAction extends Action {
    static options() {
        return {
            "$eval": "filter",
            "as": "@string"
        };
    }
    constructor(name, options, concept) {
        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;
        return this.forEachContext(contexts, actionArguments, async (context, options)=>{

            let filter = FilterAction.constructFilter(this.options);

            let shouldFilter = await filter.filter(context);

            let variableName = Action.defaultVariableName(self);

            if(options.as != null) {
                variableName = options.as;
            }

            Action.setVariable(context, variableName, shouldFilter);

            return context;
        });
    }
}
Action.registerPrimitiveAction("eval", EvalAction);
window.EvalAction = EvalAction;

/**
 * An action "count" that runs a select, and sets a variable to the number of instances found
 *
 * @example
 * {
 *     "count": {
 *         "concept": "myConcept",
 *         "where": {
 *             "property": "myProperty",
 *             "equals": "myTestValue"
 *         },
 *         "as": "myResultVariableName"
 *     }
 * }
 */
class CountAction extends SelectAction {
    static options() {
        return {
            "$selectType": "enumValue[concept,property,variable]",
            "where": "filter",
            "as": "@string",
            "forEach": "boolean%false"
        };
    }

    constructor(name, options, concept) {
        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;

        if(this.options.forEach) {
            return this.forEachContext(contexts, actionArguments, async (context, options)=>{
                let clonedContext = Action.cloneContext(context);
                let selectResult = await super.apply([clonedContext], actionArguments);
                let count = selectResult.length;

                let variableName = Action.defaultVariableName(self);

                if(options.as != null) {
                    variableName = options.as;
                }

                Action.setVariable(context, variableName, count);

                return context;
            });
        } else {
            let clonedContexts = contexts.map((context)=>{
                return Action.cloneContext(context);
            });

            //Bulk mode, check if extist, and set true/false on all
            let selectResult = await super.apply(clonedContexts, actionArguments);
            let count = selectResult.length;

            return this.forEachContext(contexts, actionArguments, async (context, options)=>{
                let variableName = Action.defaultVariableName(self);

                if(options.as != null) {
                    variableName = options.as;
                }

                Action.setVariable(context, variableName, count);

                return context;
            });
        }
    }
}
Action.registerPrimitiveAction("count", CountAction);
window.CountAction = CountAction;

/**
 * An action "exists" that runs a select, and sets a variable to true/false depending on if any instance was found
 *
 * @example
 * {
 *     "exists": {
 *         "concept": "myConcept",
 *         "where": {
 *             "property": "myProperty",
 *             "equals": "myTestValue"
 *         },
 *         "as": "myResultVariableName"
 *     }
 * }
 */
class ExistsAction extends SelectAction {
    static options() {
        return {
            "$selectType": "enumValue[concept,property,variable]",
            "where": "filter",
            "as": "@string",
            "forEach": "boolean%false"
        };
    }

    constructor(name, options, concept) {
        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;

        if(this.options.forEach) {
            return this.forEachContext(contexts, actionArguments, async (context, options)=>{
                let clonedContext = Action.cloneContext(context);
                let selectResult = await super.apply([clonedContext], actionArguments);
                let exists = selectResult.length > 0;

                let variableName = Action.defaultVariableName(self);

                if(options.as != null) {
                    variableName = options.as;
                }

                Action.setVariable(context, variableName, exists);

                return context;
            });
        } else {
            let clonedContexts = contexts.map((context)=>{
                return Action.cloneContext(context);
            });

            //Bulk mode, check if extist, and set true/false on all
            let selectResult = await super.apply(clonedContexts, actionArguments);
            let exists = selectResult.length > 0;

            return this.forEachContext(contexts, actionArguments, async (context, options)=>{
                let variableName = Action.defaultVariableName(self);

                if(options.as != null) {
                    variableName = options.as;
                }

                Action.setVariable(context, variableName, exists);

                return context;
            });
        }
    }
}
Action.registerPrimitiveAction("exists", ExistsAction);
window.ExistsAction = ExistsAction;

/**
 * An action 'sort' that sorts the selected concepts naturally based on a property/variable, can be sorted either ascending or descending.
 *
 * Always sorts "naturally", and only supports string, number and boolean types.
 *
 * @example
 * {"sort: {
 *     "property": "myProperty",
 *     "order": "asc"
 * }}
 *
 * @example
 * {"sort: {
 *     "variable": "myVariable",
 *     "order": "desc"
 * }}
 *
 * @example
 * //Shorthand sorts ascending on property
 * {"sort: "myProperty"}
 */
class SortAction extends Action {
    constructor(name, options, concept) {
        if(typeof options === "string") {
            options = {
                "property": options
            }
        }

        if(options.order == null) {
            options.order = "asc"
        }

        super(name, options, concept);
    }

    async apply(contexts, actionArguments) {
        const self = this;

        const sortedContexts = [];
        sortedContexts.push(...contexts);

        let optionsWithArguments = await Action.lookupArguments(this.options, actionArguments);

        if(optionsWithArguments.property == null && optionsWithArguments.variable == null) {
            throw new Error("Missing option property or variable on sort action");
        }

        sortedContexts.sort((c1, c2)=>{
            let s1 = null;
            let s2 = null;

            if(optionsWithArguments.property) {
                //We have an invariant that says that all selected concepts are of same type
                const concept = VarvEngine.getConceptFromUUID(c1.target);
                if(concept == null) {
                    throw new Error("Unable to find concept for uuid ["+c1.target+"]");
                }

                const property = concept.getProperty(optionsWithArguments.property);
                if(property == null) {
                    throw new Error("Unable to find property ["+optionsWithArguments.property+"] on ["+concept.name+"]");
                }

                s1 = property.getValue(c1.target);
                s2 = property.getValue(c2.target);
            } else {
                //Variable
                s1 = Action.getVariable(c1, optionsWithArguments.variable);
                s2 = Action.getVariable(c2, optionsWithArguments.variable);
            }

            if(typeof s1 !== typeof s2) {
                throw new Error("Unable to sort when not the same type: ("+s1+") - ("+s2+")");
            }

            if(typeof s1 === "number") {
                return s1 - s2;
            } else if(typeof s1 === "string") {
                return s1.localeCompare(s2);
            } else if(typeof s1 === "boolean") {
                return s1 - s2;
            } else {
                console.warn("Unable to sort "+(typeof s1));
            }
        });

        return sortedContexts;
    }
}
Action.registerPrimitiveAction("sort", SortAction);
window.SortAction = SortAction;
