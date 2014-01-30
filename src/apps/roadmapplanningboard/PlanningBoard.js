(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Rally.apps.roadmapplanningboard.PlanningBoard', {
        extend: 'Rally.ui.cardboard.CardBoard',
        alias: 'widget.roadmapplanningboard',

        inject: ['timeframeStore', 'planStore', 'preliminaryEstimateStore'],

        requires: [
            'Rally.data.util.PortfolioItemHelper',
            'Rally.ui.cardboard.plugin.FixedHeader',
            'Rally.apps.roadmapplanningboard.PlanningBoardColumn',
            'Rally.apps.roadmapplanningboard.TimeframePlanningColumn',
            'Rally.apps.roadmapplanningboard.BacklogBoardColumn',
            'Rally.apps.roadmapplanningboard.util.TimeframePlanStoreWrapper',
            'Rally.apps.roadmapplanningboard.util.PlanGenerator',
            'Rally.ui.Button'
        ],

        cls: 'roadmap-board cardboard',

        config: {
            roadmap: null,
            timeline: null,
            isAdmin: false,
            cardConfig: {
                fields: ['FormattedID', 'Owner', 'Name', 'Project', 'PreliminaryEstimate', 'Parent', 'LeafStoryCount', 'PercentDoneByStoryCount'],
                editable: true,
                skipDefaultFields: true
            },
            ddGroup: 'planningBoard',
            dropAllowed: "planningBoard",
            dropNotAllowed: "planningBoard",

            /**
             * @cfg {Boolean}
             * Toggle whether the theme is expanded or collapsed
             */
            showTheme: true,

            /**
             * @cfg {Object} Object containing Names and TypePaths of the lowest level portfolio item (eg: 'Feature') and optionally its parent (eg: 'Initiative')
             */
            typeNames: {},

            /**
             * @cfg {Number} The duration of the theme slide animation in milliseconds
             */
            slideDuration: 250
        },

        clientMetrics: [
            {
                method: '_toggleThemes',
                descriptionProperty: '_getClickAction'
            }
        ],

        initComponent: function () {
            this.timeframePlanStoreWrapper = Ext.create('Rally.apps.roadmapplanningboard.util.TimeframePlanStoreWrapper', {
                timeframeStore: this.timeframeStore,
                planStore: this.planStore
            });

            if(!this.typeNames.child || !this.typeNames.child.name) {
                throw 'typeNames must have a child property with a name';
            }

            this.callParent(arguments);
        },

        shouldRetrieveModels: function () {
            return !this.columns || this.columns.length === 0;
        },

        onModelsRetrieved: function (callback) {
            Deft.Promise.all([this._loadTimeframeStore(), this._loadPlanStore(), this._loadPreliminaryStore()]).then({
                success: function (results) {
                    this.buildColumns();
                    callback.call(this);
                },
                failure: function (operation) {
                    var service = operation.storeServiceName || 'External';
                    Rally.ui.notify.Notifier.showError({message: 'Failed to load: ' + service + ' service data load issue'});
                },
                scope: this
            });
        },

        drawAddNewColumnButton: function () {
            var column = this.getRightmostColumn();
            if (column.rendered && this.isAdmin) {
                if (this.addNewColumnButton) {
                    this.addNewColumnButton.destroy();
                }
                this.addNewColumnButton = Ext.create('Rally.ui.Button', {
                    border: 1,
                    text: '<i class="icon-add"></i>',
                    elTooltip: 'Add Timeframe',
                    cls: 'scroll-button right',
                    height: column.getHeaderTitle().getHeight(),
                    frame: false,
                    handler: this._addNewColumn,
                    renderTo: column.getHeaderTitle().getEl(),
                    scope: this,
                    userAction: 'rpb add timeframe'
                });
            }
        },

        getRightmostColumn: function () {
            return _.last(this.getColumns());
        },

        _loadPlanStore: function () {
            return this.planStore.load({
                params: {
                    roadmap: {
                        id: this.roadmap.getId()
                    }
                },
                reqester: this,
                storeServiceName: 'Planning'
            });
        },

        _loadTimeframeStore: function () {
            return this.timeframeStore.load({
                params: {
                    timeline: {
                        id: this.timeline.getId()
                    }
                },
                requester: this,
                storeServiceName: 'Timeline'
            });
        },

        _loadPreliminaryStore: function() {
            return this.preliminaryEstimateStore.load();
        },

        /**
         * @inheritDoc
         */
        renderColumns: function () {
            this.callParent(arguments);
            this.drawThemeToggle();
            this.drawAddNewColumnButton();
        },

        /**
         * This method will build an array of columns from timeframe and plan stores
         * @returns {Array} columns
         */
        buildColumns: function () {
            var planColumns = _.map(this.timeframePlanStoreWrapper.getTimeframeAndPlanRecords(), function (record) {
                return this._addColumnFromTimeframeAndPlan(record.timeframe, record.plan);
            }, this);

            this.columns = [this._getBacklogColumnConfig()].concat(planColumns);

            return this.columns;
        },

        _getBacklogColumnConfig: function () {
            return {
                xtype: 'backlogplanningcolumn',
                types: this.types,
                typeNames: this.typeNames,
                planStore: this.planStore,
                cls: 'column backlog',
                cardConfig: {
                    preliminaryEstimateStore: this.preliminaryEstimateStore
                }
            };
        },

        /**
         * Return the backlog column if it exists
         * @returns {Rally.apps.roadmapplanningboard.BacklogBoardColumn} column The backlog column of the cardboard
         */
        getBacklogColumn: function () {
            var columns = this.getColumns();

            if (!Ext.isEmpty(columns)) {
                return columns[0];
            } else {
                return null;
            }
        },

        /**
         * Get the first record of the cardboard
         * @returns {Rally.data.Record}
         */
        getFirstRecord: function () {
            var cards;
            var record = null;
            var column = this.getBacklogColumn();

            if (column) {
                cards = column.getCards();
                if (!Ext.isEmpty(cards)) {
                    record = cards[0].getRecord();
                }
            }
            return record;
        },

        /**
         * Draws the theme toggle buttons to show/hide the themes
         */
        drawThemeToggle: function () {
            this._destroyThemeButton();

            this.themeToggleButton = Ext.create('Rally.ui.Button', {
                cls: 'theme-button',
                listeners: {
                    click: this._toggleThemes,
                    scope: this
                }
            });

            _.last(this.getColumns()).getColumnHeader().insert(2, this.themeToggleButton);

            this._updateThemeButton();
        },

        _toggleThemes: function () {
            this.showTheme = !this.showTheme;
            this.themeToggleButton.hide();
            this._updateThemeButton();
            this._updateThemeContainers().then({
                success: function () {
                    this.fireEvent('headersizechanged');
                },
                scope: this
            });
        },

        _updateThemeButton: function () {
            this.themeToggleButton.removeCls(['theme-button-collapse', 'theme-button-expand']);

            if(this.showTheme) {
                this.themeToggleButton.setIconCls('icon-chevron-up');
                this.themeToggleButton.addCls('theme-button-collapse');
            } else {
                this.themeToggleButton.setIconCls('icon-chevron-down');
                this.themeToggleButton.addCls('theme-button-expand');
            }

            this.themeToggleButton.show();
        },

        _addNewColumn: function () {
            var generator = Ext.create('Rally.apps.roadmapplanningboard.util.PlanGenerator', {
                timeframePlanStoreWrapper: this.timeframePlanStoreWrapper,
                roadmap: this.roadmap
            });
            
            this.addNewColumnButton.setDisabled(true);
            
            generator.createPlanWithTimeframe().then({
                success: function (records) {
                    var column = this.addNewColumn(this._addColumnFromTimeframeAndPlan(records.timeframeRecord, records.planRecord));
                    column.columnHeader.down('rallyclicktoeditfieldcontainer').goToEditMode();
                },
                failure: function (error) {
                    this.addNewColumnButton.setDisabled(false);
                    Rally.ui.notify.Notifier.showError({message: 'Failed to create new column: ' + error});
                },
                scope: this
            });
        },

        addNewColumn: function (columnConfig) {
            var columnEls = this.createColumnElements('after', _.last(this.getColumns()));
            var column = this.addColumn(columnConfig, this.getColumns().length);
            this.renderColumn(column, columnEls);

            this.drawThemeToggle();
            this.drawAddNewColumnButton();

            return column;
        },

        _updateThemeContainers: function () {
            var themeContainers = _.map(this.getEl().query('.theme_container'), Ext.get);
            var promises = _.map(themeContainers, this._toggleThemeContainer, this);

            return Deft.Promise.all(promises);
        },

        _toggleThemeContainer: function (el) {
            var deferred = new Deft.Deferred();

            el.addCls('theme-transitioning');

            var slide = this.showTheme ? el.slideIn : el.slideOut;

            slide.call(el, 't', {
                duration: this.slideDuration,
                listeners: {
                    afteranimate: function () {
                        el.removeCls('theme-transitioning');

                        if(!this.showTheme) {
                            el.setStyle('display', 'none'); // OMG Ext. Y U SUCK?
                        }

                        deferred.resolve();
                    },
                    scope: this
                }
            });

            return deferred.promise;
        },

        destroy: function () {
            this._destroyThemeButton();
            this.callParent(arguments);
        },

        _destroyThemeButton: function () {
            if(this.themeToggleButton) {
                this.themeToggleButton.destroy();
            }
        },

        _addColumnFromTimeframeAndPlan: function (timeframe, plan) {
            return {
                xtype: 'timeframeplanningcolumn',
                timeframeRecord: timeframe,
                planRecord: plan,
                timeframePlanStoreWrapper: this.timeframePlanStoreWrapper,
                types: this.types,
                typeNames: this.typeNames,
                columnHeaderConfig: {
                    record: timeframe,
                    fieldToDisplay: 'name',
                    editable: this.isAdmin
                },
                cardConfig: {
                    preliminaryEstimateStore: this.preliminaryEstimateStore
                },
                editPermissions: {
                    capacityRanges: this.isAdmin,
                    theme: this.isAdmin,
                    timeframeDates: this.isAdmin
                },
                dropControllerConfig: {
                    dragDropEnabled: this.isAdmin
                },
                isMatchingRecord: function (featureRecord) {
                    return plan && _.find(plan.get('features'), function (feature) {
                        return ((feature.id === featureRecord.get('_refObjectUUID')) || (feature.id === featureRecord.getId()));
                    });
                }
            };
        },

        _getClickAction: function () {
            return 'Themes toggled from [' + !this.showTheme + '] to [' + this.showTheme + ']';
        }
    });

})();
