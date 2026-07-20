// Lightweight in-house i18n — deliberately not a library (no new npm
// dependency to install; see components/theme-provider.tsx for the same
// reasoning applied to the light/dark toggle). Flat, dot-namespaced keys so
// this can grow key-by-key as more screens get converted, without needing a
// nested-object migration later.
//
// Values may contain `{placeholder}` tokens — see components/
// translation-provider.tsx's `t(key, params)` for the simple interpolation
// this supports (e.g. t("customerSimilarity.customersBadge", { count: 12 })).
//
// SCOPE NOTE (July 2026): the shell/nav strings (batch 1) and the Customer
// Similarity page (batch 2, converted while adding features to it) are
// wired to this dictionary. The rest of the ~20 dashboard pages still have
// hardcoded Arabic body copy — see PROJECT_LOG.md for the plan to convert
// them page-by-page as they're touched, rather than in one unverified pass.
export type Locale = "ar" | "en";

export const LOCALES: Locale[] = ["ar", "en"];

export type TranslationKey =
  | "nav.overview"
  | "nav.assistant"
  | "nav.analysisStudio"
  | "nav.files"
  | "nav.routePlanning"
  | "nav.heatmap"
  | "nav.newCustomer"
  | "nav.customerComparison"
  | "nav.customerSimilarity"
  | "nav.visitEfficiency"
  | "nav.customerLocations"
  | "nav.teamPerformance"
  | "nav.sgi"
  | "nav.visitCopilot"
  | "nav.team"
  | "nav.employees"
  | "nav.settings"
  | "shell.brand"
  | "shell.tagline"
  | "shell.logout"
  | "shell.searchPlaceholder"
  | "group.data"
  | "group.aiInsights"
  | "group.customersTerritory"
  | "group.team"
  | "group.system"
  | "language.switchTo"
  | "customerSimilarity.title"
  | "customerSimilarity.subtitle"
  | "customerSimilarity.settingsCard"
  | "customerSimilarity.noFiles"
  | "customerSimilarity.customerFileLabel"
  | "customerSimilarity.chooseFile"
  | "customerSimilarity.chooseCategory"
  | "customerSimilarity.latColumn"
  | "customerSimilarity.lonColumn"
  | "customerSimilarity.idColumn"
  | "customerSimilarity.nameColumnOptional"
  | "customerSimilarity.scopeColumnOptional"
  | "customerSimilarity.clusterCountLabel"
  | "customerSimilarity.scopeValuesLabel"
  | "customerSimilarity.salesSectionLabel"
  | "customerSimilarity.salesCustomerIdColumn"
  | "customerSimilarity.salesAmountColumn"
  | "customerSimilarity.salesSkuColumnOptional"
  | "customerSimilarity.similarityBasisLabel"
  | "customerSimilarity.basisSales"
  | "customerSimilarity.basisCollection"
  | "customerSimilarity.basisReturns"
  | "customerSimilarity.categoryFilterToggleOn"
  | "customerSimilarity.categoryFilterToggleOff"
  | "customerSimilarity.categoryColumnLabel"
  | "customerSimilarity.categoryValueLabel"
  | "customerSimilarity.collectionSectionLabel"
  | "customerSimilarity.returnsSectionLabel"
  | "customerSimilarity.avgValueSales"
  | "customerSimilarity.avgValueCollection"
  | "customerSimilarity.avgValueReturns"
  | "customerSimilarity.runButton"
  | "customerSimilarity.runningButton"
  | "customerSimilarity.resultCard"
  | "customerSimilarity.customersBadge"
  | "customerSimilarity.excludedBadge"
  | "customerSimilarity.legendGroup"
  | "customerSimilarity.tableGroup"
  | "customerSimilarity.tableCustomers"
  | "customerSimilarity.tableAvgSpend"
  | "customerSimilarity.tableAvgOrders"
  | "customerSimilarity.tableAvgSkuVariety"
  | "customerSimilarity.exportButton"
  | "customerSimilarity.memberIdHeader"
  | "customerSimilarity.memberNameHeader"
  | "customerSimilarity.memberValueHeader"
  | "customerSimilarity.toastSuccess"
  | "customerSimilarity.toastError"
  | "customerSimilarity.noCustomersInGroup"
  | "customerSimilarity.groupFilterLabel"
  | "customerSimilarity.groupFilterAll"
  | "customerSimilarity.groupFilterCount"
  | "dashboard.greeting"
  | "dashboard.greetingNoName"
  | "dashboard.statusTrial"
  | "dashboard.statusActive"
  | "dashboard.statusExpired"
  | "dashboard.statusSuspended"
  | "dashboard.heroCta"
  | "dashboard.kpiActiveFiles"
  | "dashboard.kpiLastUpload"
  | "dashboard.kpiLastUploadNone"
  | "dashboard.kpiSubscription"
  | "dashboard.kpiTrialDays"
  | "dashboard.kpiTrialDaysUnit"
  | "dashboard.aiCardTitle"
  | "dashboard.aiCardBody"
  | "dashboard.aiCardCta"
  | "dashboard.filesCardTitle"
  | "dashboard.filesCardManage"
  | "dashboard.filesEmptyTitle"
  | "dashboard.filesEmptyReason"
  | "dashboard.filesEmptyAction"
  | "dashboard.quickActionsTitle"
  | "dashboard.quickActionFiles"
  | "dashboard.quickActionAssistant"
  | "dashboard.quickActionHeatmap"
  | "dashboard.quickActionSgi"
  | "files.title"
  | "files.subtitle"
  | "files.activeCount"
  | "files.uploadedFiles"
  | "files.pendingConfirmation"
  | "files.empty"
  | "files.deleteSuccess"
  | "files.deleteError"
  | "files.downloadUrlError"
  | "files.confidenceSuffix"
  | "files.classifiedSuccess"
  | "files.needsConfirmation"
  | "files.uploadFailed"
  | "files.validationRejected"
  | "files.targetCompanyLabel"
  | "files.targetCompanyPlaceholder"
  | "files.targetCompanyHint"
  | "files.batchEntitiesCount"
  | "files.batchAccepted"
  | "files.batchAcceptedMore"
  | "files.batchRejected"
  | "files.replaceOtherAccepted"
  | "files.dropzoneText"
  | "files.classifying"
  | "files.chooseFiles"
  | "files.atLimit"
  | "files.provisionTitle"
  | "files.provisionWarning"
  | "files.provisionCopyAll"
  | "files.provisionCopied"
  | "files.provisionDismiss"
  | "files.provisionUpdatedCount"
  | "files.provisionSkippedCount"
  | "files.provisionName"
  | "files.provisionEmail"
  | "files.provisionRole"
  | "files.provisionPassword"
  | "files.replaceUploadedNeedsConfirm"
  | "files.carryOverRepSupervisorColumns"
  | "files.carryOverRouteHierarchy"
  | "files.carryOverCascadedSingular"
  | "files.carryOverCascadedPlural"
  | "files.carryOverSgi"
  | "files.replaceSuccessWithCarryOver"
  | "files.replaceSuccess"
  | "files.skippedColumnsWarning"
  | "files.replaceError"
  | "files.replaceFileTitle"
  | "files.hierarchyColumnsUpdateSuccess"
  | "files.hierarchyColumnsUpdateError"
  | "files.hierarchyColumnsConfigured"
  | "files.hierarchyColumnsSetPrompt"
  | "files.noHeadersDetected"
  | "files.hierarchyColumnsExplanation"
  | "files.repColumnLabel"
  | "files.supervisorColumnLabel"
  | "files.managerColumnLabel"
  | "files.cancel"
  | "files.save"
  | "files.nonePlaceholder"
  | "files.noneOption"
  | "files.routeLinkSuccess"
  | "files.saveError"
  | "files.routeUnlinkSuccess"
  | "files.cancelError"
  | "files.routeConfigured"
  | "files.routeLinkPrompt"
  | "files.routeExplanation"
  | "files.routesFileLabel"
  | "files.chooseFilePlaceholder"
  | "files.routeIdColumnLabel"
  | "files.routeRepColumnLabel"
  | "files.routeSupervisorColumnLabel"
  | "files.employeesFileLabel"
  | "files.employeeIdColumnLabel"
  | "files.employeeEmailColumnLabel"
  | "files.employeeSupervisorEmailColumnLabel"
  | "files.unlinkButton"
  | "files.close"
  | "files.rowCountChip"
  | "files.columnCountChip"
  | "files.periodChip"
  | "files.regionChip"
  | "files.branchChip"
  | "files.salesRepChip"
  | "files.routeChip"
  | "files.statusReady"
  | "files.statusFailed"
  | "files.statusProcessing"
  | "files.confirmTypeSuccess"
  | "files.confirmTypeError"
  | "files.lowConfidenceNoGuess"
  | "files.lowConfidenceWithGuess"
  | "files.confidenceGuessPrefix"
  | "files.confidenceGuessSuffix"
  | "files.confirm"
  | "files.correct"
  | "files.updateSuccess"
  | "files.updateError"
  | "files.mixedWorkbookExplanation"
  | "files.unknownType"
  | "files.sheetInfo"
  | "files.useThisSheet"
  | "files.chooseTypePlaceholder"
  | "assistant.title"
  | "assistant.subtitle"
  | "assistant.suggestion1"
  | "assistant.suggestion2"
  | "assistant.suggestion3"
  | "assistant.inputPlaceholder"
  | "assistant.thinking"
  | "assistant.errorFallback"
  | "heatmap.title"
  | "heatmap.subtitle"
  | "heatmap.settingsTitle"
  | "heatmap.scopeFieldLabel"
  | "heatmap.scopeFieldNone"
  | "heatmap.scopeValueLabel"
  | "heatmap.scopeValueAll"
  | "heatmap.loading"
  | "heatmap.metricLabel"
  | "heatmap.metricSales"
  | "heatmap.metricReturns"
  | "heatmap.metricCollection"
  | "heatmap.metricLostSales"
  | "heatmap.metricOpportunity"
  | "heatmap.metricCustomerCount"
  | "heatmap.scopeRoute"
  | "heatmap.scopeCity"
  | "heatmap.scopeCustomerClass"
  | "heatmap.scopeChannel"
  | "heatmap.categoryFilterDisable"
  | "heatmap.categoryFilterEnable"
  | "heatmap.categoryLabel"
  | "heatmap.categoryPlaceholder"
  | "heatmap.dateFromLabel"
  | "heatmap.dateToLabel"
  | "heatmap.lostSalesHint"
  | "heatmap.opportunityHint"
  | "heatmap.priorWindowLabel"
  | "heatmap.recentWindowLabel"
  | "heatmap.updateMapButton"
  | "heatmap.updatingButton"
  | "heatmap.freeTextTitle"
  | "heatmap.freeTextPlaceholder"
  | "heatmap.applyButton"
  | "heatmap.freeTextHint"
  | "heatmap.resultTitle"
  | "heatmap.pointsBadge"
  | "heatmap.metricBadge"
  | "heatmap.totalBadge"
  | "heatmap.excludedBadge"
  | "heatmap.generateDecisionsButton"
  | "heatmap.pointsToastSuccess"
  | "heatmap.interpretWarningFallback"
  | "heatmap.interpretSuccessFallback"
  | "heatmap.interpretErrorFallback"
  | "heatmap.queryErrorFallback"
  | "heatmap.decisionErrorFallback"
  | "team.title"
  | "team.subtitle"
  | "team.tempPasswordTitle"
  | "team.tempPasswordNote"
  | "team.tempPasswordAck"
  | "team.addUser"
  | "team.addUserDialogTitle"
  | "team.fullNameLabel"
  | "team.emailLabel"
  | "team.roleLabel"
  | "team.chooseRole"
  | "team.tempPasswordLabel"
  | "team.createUser"
  | "team.members"
  | "team.loading"
  | "team.nameHeader"
  | "team.roleHeader"
  | "team.branchHeader"
  | "team.statusHeader"
  | "team.joinedHeader"
  | "team.noBranch"
  | "team.statusPending"
  | "team.statusActive"
  | "team.statusInvited"
  | "team.statusSuspended"
  | "team.statusLocked"
  | "team.statusDisabled"
  | "team.statusArchived"
  | "team.disable"
  | "team.enable"
  | "team.resetPassword"
  | "team.revokeSessions"
  | "team.delete"
  | "team.deleteConfirm"
  | "team.toastUserDeleted"
  | "team.toastUserDeleteError"
  | "team.toastUserInvited"
  | "team.toastUserCreateError"
  | "team.toastUserUpdateError"
  | "team.toastBranchUpdateError"
  | "team.toastTempPasswordCreated"
  | "team.toastPasswordResetError"
  | "team.toastSessionsRevoked"
  | "team.toastSessionsRevokeError"
  | "sgi.title"
  | "sgi.subtitle"
  | "sgi.toastRecalculateSuccess"
  | "sgi.toastRecalculateError"
  | "sgi.toastRecalculateNowSuccess"
  | "sgi.toastRecalculateNowError"
  | "sgi.setupCardTitleCustomPeriod"
  | "sgi.setupCardTitleFirstTime"
  | "sgi.cancel"
  | "sgi.targetMonthLabel"
  | "sgi.dateFromLabel"
  | "sgi.dateToLabel"
  | "sgi.priorDateFromLabel"
  | "sgi.priorDateToLabel"
  | "sgi.calculateNow"
  | "sgi.loadErrorMessage"
  | "sgi.emptyStateMessage"
  | "sgi.lastUpdatedPrefix"
  | "sgi.scopedToOwnTeamSuffix"
  | "sgi.refreshNow"
  | "sgi.customPeriod"
  | "sgi.monthlyGoalTitle"
  | "sgi.noTargetsMessage"
  | "sgi.progressOf"
  | "sgi.priorityCenterTitle"
  | "employees.title"
  | "employees.subtitle"
  | "employees.addEmployee"
  | "employees.addEmployeeDialogTitle"
  | "employees.employeeCodeLabel"
  | "employees.fullNameLabel"
  | "employees.jobTitleLabel"
  | "employees.branchLabel"
  | "employees.noBranch"
  | "employees.managerLabel"
  | "employees.noManagerDialog"
  | "employees.contactEmailLabel"
  | "employees.contactPhoneLabel"
  | "employees.addEmployeeSubmit"
  | "employees.recordTitle"
  | "employees.recordDescription"
  | "employees.loading"
  | "employees.empty"
  | "employees.codeHeader"
  | "employees.nameHeader"
  | "employees.jobTitleHeader"
  | "employees.branchHeader"
  | "employees.managerHeader"
  | "employees.linkedAccountHeader"
  | "employees.statusHeader"
  | "employees.hireDateHeader"
  | "employees.noManagerRow"
  | "employees.linked"
  | "employees.notLinked"
  | "employees.editData"
  | "employees.unlinkAccount"
  | "employees.linkAccount"
  | "employees.archive"
  | "employees.editDialogTitle"
  | "employees.hireDateLabel"
  | "employees.statusLabel"
  | "employees.saveChanges"
  | "employees.toastEmployeeCreated"
  | "employees.toastEmployeeCreateError"
  | "employees.toastEmployeeUpdated"
  | "employees.toastEmployeeUpdateError"
  | "employees.toastEmployeeArchived"
  | "employees.toastEmployeeArchiveError"
  | "employees.toastBranchUpdateError"
  | "employees.toastManagerUpdateError"
  | "employees.toastUserLinked"
  | "employees.toastLinkError"
  | "employees.toastUnlinked"
  | "employees.toastUnlinkError"
  | "employees.statusDraft"
  | "employees.statusActive"
  | "employees.statusOnLeave"
  | "employees.statusSuspended"
  | "employees.statusInactive"
  | "employees.statusArchived"
  | "settings.title"
  | "settings.subtitle"
  | "settings.tabCompany"
  | "settings.tabBranches"
  | "settings.tabDataSources"
  | "settings.tabPolicies"
  | "settings.tabAccount"
  | "settings.tabBilling"
  | "settings.loading"
  | "settings.save"
  | "settings.saveChanges"
  | "settings.cancel"
  | "settings.edit"
  | "settings.define"
  | "settings.add"
  | "settings.archive"
  | "settings.delete"
  | "settings.activate"
  | "settings.suspend"
  | "settings.statusHeader"
  | "settings.nameHeader"
  | "settings.statusActiveGeneric"
  | "settings.statusArchivedGeneric"
  | "settings.companyDataTitle"
  | "settings.companyNameLabel"
  | "settings.companyUpdateSuccess"
  | "settings.companyUpdateError"
  | "settings.profileTitle"
  | "settings.profileDescription"
  | "settings.countryLabel"
  | "settings.cityLabel"
  | "settings.timeZoneLabel"
  | "settings.currencyLabel"
  | "settings.defaultLanguageLabel"
  | "settings.fiscalYearStartLabel"
  | "settings.contactEmailLabel"
  | "settings.contactPhoneLabel"
  | "settings.profileUpdateSuccess"
  | "settings.profileUpdateError"
  | "settings.discoveryTitle"
  | "settings.discoveryDescription"
  | "settings.discoveryOsmLabel"
  | "settings.discoveryOsmDescription"
  | "settings.discoveryGoogleLabel"
  | "settings.discoveryGoogleDescription"
  | "settings.discoveryApiKeyLabel"
  | "settings.discoveryApiKeySavedPlaceholder"
  | "settings.discoveryApiKeyPlaceholder"
  | "settings.discoveryClearKey"
  | "settings.discoveryKeyRequiredHint"
  | "settings.discoveryUpdateSuccess"
  | "settings.discoveryUpdateError"
  | "settings.addBranchTitle"
  | "settings.addBranchDescription"
  | "settings.branchCodeLabel"
  | "settings.branchNameLabel"
  | "settings.currentBranchesTitle"
  | "settings.noBranchesYet"
  | "settings.codeHeader"
  | "settings.branchAddSuccess"
  | "settings.branchAddError"
  | "settings.branchArchiveSuccess"
  | "settings.branchArchiveError"
  | "settings.dsStatusDraft"
  | "settings.dsStatusConfiguring"
  | "settings.dsStatusConnected"
  | "settings.dsStatusSuspended"
  | "settings.healthHealthy"
  | "settings.healthWarning"
  | "settings.healthError"
  | "settings.healthOffline"
  | "settings.refreshQueued"
  | "settings.refreshRunning"
  | "settings.refreshCompleted"
  | "settings.refreshFailed"
  | "settings.authNone"
  | "settings.authBasic"
  | "settings.authApiKey"
  | "settings.connHost"
  | "settings.connPort"
  | "settings.connDatabase"
  | "settings.connBaseUrl"
  | "settings.connBucket"
  | "settings.dataSourcesIntro"
  | "settings.addDataSource"
  | "settings.addDataSourceDialogTitle"
  | "settings.dsNameLabel"
  | "settings.dsTypeLabel"
  | "settings.dsTypePlaceholder"
  | "settings.dsDescriptionLabel"
  | "settings.dsCategoryLabel"
  | "settings.dsCategoryPlaceholder"
  | "settings.authMethodLabel"
  | "settings.ownerLabel"
  | "settings.noOwner"
  | "settings.connectionFieldsTitle"
  | "settings.credentialsTitle"
  | "settings.credUsernameLabel"
  | "settings.credSecretLabel"
  | "settings.addDataSourceSubmit"
  | "settings.registeredDataSourcesTitle"
  | "settings.noDataSourcesYet"
  | "settings.typeHeader"
  | "settings.categoryHeader"
  | "settings.healthHeader"
  | "settings.lastRefreshHeader"
  | "settings.neverRefreshed"
  | "settings.runRefreshNow"
  | "settings.testConnection"
  | "settings.confirmDeleteDataSource"
  | "settings.refreshHistoryTitle"
  | "settings.refreshHistoryDescription"
  | "settings.noRefreshRunsYet"
  | "settings.sourceHeader"
  | "settings.dataQualityHeader"
  | "settings.missingFilesHeader"
  | "settings.listSeparator"
  | "settings.durationHeader"
  | "settings.runDateHeader"
  | "settings.durationSeconds"
  | "settings.dataSourceAddSuccess"
  | "settings.dataSourceAddError"
  | "settings.dataSourceStatusUpdateError"
  | "settings.dataSourceTestError"
  | "settings.refreshSuccessMessage"
  | "settings.refreshFailureMessage"
  | "settings.refreshTriggerError"
  | "settings.dataSourceDeleteSuccess"
  | "settings.dataSourceDeleteError"
  | "settings.policyTypeOrganizational"
  | "settings.policyTypePassword"
  | "settings.policyTypeRefresh"
  | "settings.policyTypeEmployeeAssignment"
  | "settings.policyTypePermission"
  | "settings.policyTypeArchiving"
  | "settings.policySaveSuccess"
  | "settings.policySaveError"
  | "settings.invalidJson"
  | "settings.companyPoliciesTitle"
  | "settings.companyPoliciesDescription"
  | "settings.policyHeader"
  | "settings.versionHeader"
  | "settings.policyEnabled"
  | "settings.policyDisabled"
  | "settings.policyUndefined"
  | "settings.policyContentDescription"
  | "settings.complianceOverviewTitle"
  | "settings.complianceOverviewDescription"
  | "settings.fullyCompliant"
  | "settings.hasUndefinedPolicies"
  | "settings.compliant"
  | "settings.nonCompliant"
  | "settings.changePasswordTitle"
  | "settings.changePasswordDescription"
  | "settings.currentPasswordLabel"
  | "settings.newPasswordLabel"
  | "settings.changePasswordSuccess"
  | "settings.changePasswordError"
  | "settings.gptSettingsTitle"
  | "settings.gptSettingsDescription"
  | "settings.gptNameLabel"
  | "settings.apiKeyIdLabel"
  | "settings.regenerateApiKey"
  | "settings.gptSaveSuccess"
  | "settings.gptSaveError"
  | "settings.regenerateSuccess"
  | "settings.regenerateError"
  | "settings.saveApiKeyNowTitle"
  | "settings.saveApiKeyNowDescription"
  | "settings.paymentSucceeded"
  | "settings.paymentFailed"
  | "settings.paymentPending"
  | "settings.subTrial"
  | "settings.subActive"
  | "settings.subExpired"
  | "settings.subSuspended"
  | "settings.currentPlanTitle"
  | "settings.pricePerMonth"
  | "settings.paymentHistoryTitle"
  | "settings.noPaymentsYet"
  | "settings.dateHeader"
  | "settings.amountHeader"
  | "customerComparison.title"
  | "customerComparison.subtitle"
  | "customerComparison.settingsTitle"
  | "customerComparison.targetCustomerLabel"
  | "customerComparison.searchPlaceholder"
  | "customerComparison.customersLoadError"
  | "customerComparison.noResults"
  | "customerComparison.nearestCountLabel"
  | "customerComparison.compareButton"
  | "customerComparison.compareSuccessToast"
  | "customerComparison.compareErrorFallback"
  | "customerComparison.talkingPointsErrorFallback"
  | "customerComparison.resultTitle"
  | "customerComparison.targetCustomerBadge"
  | "customerComparison.neighborsBadge"
  | "customerComparison.targetProductCountBadge"
  | "customerComparison.gapProductsBadge"
  | "customerComparison.excludedBadge"
  | "customerComparison.mapTitle"
  | "customerComparison.mapCenterLabel"
  | "customerComparison.mapNeighborLabel"
  | "customerComparison.gapTableTitle"
  | "customerComparison.noGapMessage"
  | "customerComparison.colProduct"
  | "customerComparison.colCategory"
  | "customerComparison.colTotalQty"
  | "customerComparison.colTotalValue"
  | "customerComparison.colCustomerCount"
  | "customerComparison.talkingPointsTitle"
  | "customerComparison.talkingPointsDescription"
  | "customerComparison.generateTalkingPointsButton"
  | "analysisStudio.__reserved"
  | "customerLocations.__reserved"
  | "newCustomer.__reserved"
  | "routePlanning.__reserved"
  | "visitEfficiency.__reserved"
  | "teamPerformance.title"
  | "teamPerformance.descriptionSupervisor"
  | "teamPerformance.descriptionManager"
  | "teamPerformance.repCount"
  | "teamPerformance.loadError"
  | "teamPerformance.settingsTitle"
  | "teamPerformance.dateFromLabel"
  | "teamPerformance.dateToLabel"
  | "teamPerformance.compareEnableButton"
  | "teamPerformance.compareDisableButton"
  | "teamPerformance.priorDateFromLabel"
  | "teamPerformance.priorDateToLabel"
  | "teamPerformance.showPerformanceButton"
  | "teamPerformance.exportExcelButton"
  | "teamPerformance.categorySales"
  | "teamPerformance.categoryCollection"
  | "teamPerformance.categoryReturns"
  | "teamPerformance.categoryUnavailableBadge"
  | "teamPerformance.flatViewTitle"
  | "teamPerformance.treeViewTitle"
  | "teamPerformance.emptyReps"
  | "teamPerformance.noSupervisor"
  | "teamPerformance.salesValue"
  | "teamPerformance.salesEmpty"
  | "teamPerformance.salesUnavailable"
  | "teamPerformance.collectionValue"
  | "teamPerformance.collectionUnavailable"
  | "teamPerformance.returnsValue"
  | "teamPerformance.returnsUnavailable"
  | "teamPerformance.coachButton"
  | "teamPerformance.coachError"
  | "teamPerformance.colRep"
  | "teamPerformance.colEmail"
  | "teamPerformance.colSupervisor"
  | "teamPerformance.colSales"
  | "teamPerformance.colSalesPrior"
  | "teamPerformance.colSalesChangePct"
  | "teamPerformance.colCollection"
  | "teamPerformance.colCollectionRatePct"
  | "teamPerformance.colReturns"
  | "teamPerformance.colReturnRatePct"
  | "teamPerformance.notAvailable"
  | "teamPerformance.sheetName"
  | "teamPerformance.fileName"
  | "copilot.title"
  | "copilot.subtitle"
  | "copilot.periodLabel"
  | "copilot.period1m"
  | "copilot.period3m"
  | "copilot.period6m"
  | "copilot.period12m"
  | "copilot.periodCustom"
  | "copilot.fromLabel"
  | "copilot.toLabel"
  | "copilot.customPeriodHint"
  | "copilot.vanStockLabel"
  | "copilot.notWorkingDay"
  | "copilot.visitsLabel"
  | "copilot.dailyTargetLabel"
  | "copilot.noTarget"
  | "copilot.expectedSalesLabel"
  | "copilot.distanceLabel"
  | "copilot.durationLabel"
  | "copilot.kmValue"
  | "copilot.minValue"
  | "copilot.planRoute"
  | "copilot.planPriority"
  | "copilot.briefLoadError"
  | "copilot.planError"
  | "copilot.customersTitle"
  | "copilot.noCustomers"
  | "copilot.avgOrder"
  | "copilot.back"
  | "copilot.salesLabel"
  | "copilot.invoiceCount"
  | "copilot.returnsLabel"
  | "copilot.returnRate"
  | "copilot.pendingLabel"
  | "copilot.trendLabel"
  | "copilot.topProductsTitle"
  | "copilot.actionsTitle"
  | "copilot.briefingLoadError"
  | "copilot.chatTitle"
  | "copilot.chatPlaceholder"
  | "copilot.chatError"
  | "copilot.thinking"
  | "copilot.discoverButton"
  | "copilot.discoveryTitle"
  | "copilot.discoveryLoadError"
  | "copilot.mapLoading"
  | "copilot.googleSearchButton"
  | "copilot.googleSearchResult"
  | "copilot.googleSearchDisabled"
  | "copilot.geoFallbackNotice"
  | "copilot.geoUnavailable"
  | "copilot.legendExisting"
  | "copilot.legendNew"
  | "copilot.legendVisited"
  | "copilot.legendIgnored"
  | "copilot.legendConverted"
  | "copilot.popupScore"
  | "copilot.popupExpected"
  | "copilot.popupProbability"
  | "copilot.popupDistance"
  | "copilot.startVisit"
  | "copilot.ignore"
  | "copilot.ignoredToast"
  | "copilot.statusError"
  | "copilot.oppFound"
  | "copilot.oppBest"
  | "copilot.oppShowMap"
  | "copilot.prospectBadge"
  | "copilot.markVisited"
  | "copilot.markedVisited";

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  ar: {
    "nav.overview": "نظرة عامة",
    "nav.assistant": "المساعد الذكي",
    "nav.analysisStudio": "استوديو التحليل",
    "nav.files": "الملفات",
    "nav.routePlanning": "تخطيط المسارات",
    "nav.heatmap": "الخريطة الحرارية",
    "nav.newCustomer": "عميل جديد",
    "nav.customerComparison": "مقارنة العملاء",
    "nav.customerSimilarity": "تشابه الأداء",
    "nav.visitEfficiency": "كفاءة الزيارات",
    "nav.customerLocations": "إحداثيات العملاء",
    "nav.teamPerformance": "أداء الفريق",
    "nav.sgi": "إزاي تزوّد مبيعاتك",
    "nav.visitCopilot": "مساعد الزيارات",
    "nav.team": "الفريق",
    "nav.employees": "الموظفون",
    "nav.settings": "الإعدادات",
    "shell.brand": "مرشدك",
    "shell.tagline": "ذكاء المبيعات في يدك",
    "shell.logout": "تسجيل الخروج",
    "shell.searchPlaceholder": "دوّر على شاشة أو ميزة…",
    "group.data": "البيانات",
    "group.aiInsights": "الذكاء والتحليل",
    "group.customersTerritory": "العملاء والمناطق",
    "group.team": "الفريق",
    "group.system": "النظام",
    "language.switchTo": "English",
    "customerSimilarity.title": "العملاء المتشابهون في الأداء",
    "customerSimilarity.subtitle":
      'تجميع العملاء حسب أداء وسلوك الشراء بتاعهم — مش حسب الموقع الجغرافي — عشان تكتشف شرائح زي "كبار الإنفاق القليلي التكرار" أو "متكررين صغار".',
    "customerSimilarity.settingsCard": "الإعدادات",
    "customerSimilarity.noFiles": "ارفع ملف عملاء (فيه إحداثيات) وملف مبيعات من صفحة الملفات أولاً.",
    "customerSimilarity.customerFileLabel": "ملف العملاء",
    "customerSimilarity.chooseFile": "اختر ملف…",
    "customerSimilarity.chooseCategory": "اختر تصنيفًا…",
    "customerSimilarity.latColumn": "عمود خط العرض",
    "customerSimilarity.lonColumn": "عمود خط الطول",
    "customerSimilarity.idColumn": "عمود رقم العميل",
    "customerSimilarity.nameColumnOptional": "عمود الاسم (اختياري)",
    "customerSimilarity.scopeColumnOptional": "عمود النطاق (اختياري)",
    "customerSimilarity.clusterCountLabel": "عدد المجموعات السلوكية",
    "customerSimilarity.scopeValuesLabel": "قيم النطاق (اختياري — سيب فاضي يعني الكل)",
    "customerSimilarity.salesSectionLabel": "ملف الأداء (لبناء بصمة التشابه)",
    "customerSimilarity.salesCustomerIdColumn": "عمود رقم العميل",
    "customerSimilarity.salesAmountColumn": "عمود القيمة",
    "customerSimilarity.salesSkuColumnOptional": "عمود الصنف (اختياري)",
    "customerSimilarity.similarityBasisLabel": "أساس التشابه",
    "customerSimilarity.basisSales": "إجمالي المبيعات",
    "customerSimilarity.basisCollection": "التحصيل",
    "customerSimilarity.basisReturns": "المرتجعات",
    "customerSimilarity.categoryFilterToggleOn": "تحديد فئة/قسم منتج معيّن (اختياري) — تفعيل",
    "customerSimilarity.categoryFilterToggleOff": "إلغاء تحديد الفئة (رجوع لإجمالي المبيعات)",
    "customerSimilarity.categoryColumnLabel": "عمود الفئة/القسم",
    "customerSimilarity.categoryValueLabel": "قيمة الفئة (مثلاً: بسكويت)",
    "customerSimilarity.collectionSectionLabel": "ملف التحصيل (لبناء بصمة التشابه)",
    "customerSimilarity.returnsSectionLabel": "ملف المرتجعات (لبناء بصمة التشابه)",
    "customerSimilarity.avgValueSales": "متوسط الإنفاق",
    "customerSimilarity.avgValueCollection": "متوسط التحصيل",
    "customerSimilarity.avgValueReturns": "متوسط قيمة المرتجعات",
    "customerSimilarity.runButton": "جمّع الآن",
    "customerSimilarity.runningButton": "جارٍ التجميع…",
    "customerSimilarity.resultCard": "النتيجة",
    "customerSimilarity.customersBadge": "{count} عميل",
    "customerSimilarity.excludedBadge": "{count} عميل بدون بيانات أداء كافية",
    "customerSimilarity.legendGroup": "مجموعة {n}",
    "customerSimilarity.tableGroup": "المجموعة",
    "customerSimilarity.tableCustomers": "عملاء",
    "customerSimilarity.tableAvgSpend": "متوسط الإنفاق",
    "customerSimilarity.tableAvgOrders": "متوسط عدد الطلبات",
    "customerSimilarity.tableAvgSkuVariety": "متوسط تنوع الأصناف",
    "customerSimilarity.exportButton": "تصدير Excel (بالتفاصيل الكاملة)",
    "customerSimilarity.memberIdHeader": "رقم العميل",
    "customerSimilarity.memberNameHeader": "الاسم",
    "customerSimilarity.memberValueHeader": "القيمة",
    "customerSimilarity.toastSuccess": "{count} عميل في {clusters} مجموعات سلوكية",
    "customerSimilarity.toastError": "تعذر تنفيذ التجميع",
    "customerSimilarity.noCustomersInGroup": "مفيش عملاء في المجموعة دي بالفلاتر الحالية.",
    "customerSimilarity.groupFilterLabel": "المجموعات الظاهرة على الخريطة",
    "customerSimilarity.groupFilterAll": "الكل",
    "customerSimilarity.groupFilterCount": "{count} من {total}",
    "dashboard.greeting": "أهلاً بيك، {name}",
    "dashboard.greetingNoName": "أهلاً بيك",
    "dashboard.statusTrial": "باقي {days} يوم على نهاية فترتك التجريبية",
    "dashboard.statusActive": "اشتراكك فعّال ومفعّل بالكامل",
    "dashboard.statusExpired": "اشتراكك منتهي — بعض الميزات متوقفة لحد ما يتجدد",
    "dashboard.statusSuspended": "اشتراكك موقوف مؤقتًا",
    "dashboard.heroCta": "افتح مرشدك",
    "dashboard.kpiActiveFiles": "الملفات النشطة",
    "dashboard.kpiLastUpload": "آخر رفع ملف",
    "dashboard.kpiLastUploadNone": "لسه مفيش",
    "dashboard.kpiSubscription": "حالة الاشتراك",
    "dashboard.kpiTrialDays": "الأيام المتبقية بالتجربة",
    "dashboard.kpiTrialDaysUnit": "يوم",
    "dashboard.aiCardTitle": "مرشدك",
    "dashboard.aiCardBody": "اسأل عن عملائك ومبيعاتك وفرصك، وهيرد بأرقام حقيقية من ملفاتك مباشرة داخل المنصة.",
    "dashboard.aiCardCta": "افتح مرشدك",
    "dashboard.filesCardTitle": "الملفات النشطة",
    "dashboard.filesCardManage": "إدارة الملفات",
    "dashboard.filesEmptyTitle": "لسه مفيش ملفات مرفوعة",
    "dashboard.filesEmptyReason": "مرشدك محتاج ملف بيانات واحد على الأقل عشان يقدر يحلل ويرد على أسئلتك.",
    "dashboard.filesEmptyAction": "ارفع أول ملف",
    "dashboard.quickActionsTitle": "إجراءات سريعة",
    "dashboard.quickActionFiles": "الملفات",
    "dashboard.quickActionAssistant": "مرشدك",
    "dashboard.quickActionHeatmap": "الخريطة الحرارية",
    "dashboard.quickActionSgi": "إزاي تزوّد مبيعاتك",
    "files.title": "الملفات",
    "files.subtitle": "ارفع ملفات الإكسل بتاعتك — مش محتاج تحدد نوعها، النظام بيقرأ الأعمدة ويكتشفه بنفسه.",
    "files.activeCount": "{active} / {max} نشط",
    "files.uploadedFiles": "الملفات المرفوعة",
    "files.pendingConfirmation": "{count} محتاج تأكيدك",
    "files.empty": "مفيش ملفات مرفوعة لسه. ارفع ملف من فوق عشان تبدأ.",
    "files.deleteSuccess": "تم حذف الملف",
    "files.deleteError": "تعذر حذف الملف",
    "files.downloadUrlError": "تعذر إنشاء رابط التحميل",
    "files.confidenceSuffix": " (بثقة {percent}%)",
    "files.classifiedSuccess": "✓ {fileName} — تم التعرف عليه كـ {datasetType}{confidence}",
    "files.needsConfirmation": "{fileName} محتاج تأكيد سريع تحت",
    "files.uploadFailed": "أحد الملفات فشل رفعه",
    "files.validationRejected": "\"{fileName}\" مرفوض — أقرب قالب استيراد رسمي هو \"{entity}\" وفيه {count} خطأ. مثال: {detail}",
    "files.targetCompanyLabel": "الشركة المستهدفة",
    "files.targetCompanyPlaceholder": "اختر الشركة…",
    "files.targetCompanyHint": "لازم تختار الشركة الأول قبل ما ترفع أي ملف — حسابك كمشرف عام مش تابع لشركة.",
    "files.batchEntitiesCount": "{count} كيان",
    "files.batchAccepted": "\"{fileName}\" — اتقبل {accepted} من {attempted}: {entities}",
    "files.batchAcceptedMore": "و{count} كمان",
    "files.batchRejected": "\"{fileName}\" — {count} شيت اترفض ومكملش: {details}",
    "files.replaceOtherAccepted": "+ {count} كيان تاني اتقبل من نفس الملف",
    "files.dropzoneText": "اسحب وأفلت ملف إكسل أو أكتر هنا، أو",
    "files.classifying": "جارِ تصنيف {count}…",
    "files.chooseFiles": "اختر ملفات",
    "files.atLimit": "وصلت للحد الأقصى للملفات النشطة. احذف ملف عشان ترفع غيره.",
    "files.provisionTitle": "حسابات جديدة اتعملت للموظفين",
    "files.provisionWarning": "كلمات السر المؤقتة دي ظاهرة المرة دي بس ومش هتظهر تاني — انسخها ووزعها قبل ما تقفل.",
    "files.provisionCopyAll": "نسخ الكل",
    "files.provisionCopied": "اتنسخت كل الحسابات",
    "files.provisionDismiss": "تم — أغلق نهائيًا",
    "files.provisionUpdatedCount": "اتحدث {count} حساب موجود قبل كده",
    "files.provisionSkippedCount": "اتخطى {count} صف:",
    "files.provisionName": "الاسم",
    "files.provisionEmail": "الإيميل",
    "files.provisionRole": "الدور",
    "files.provisionPassword": "كلمة السر المؤقتة",
    "files.replaceUploadedNeedsConfirm": "تم رفع الملف الجديد — لسه محتاج تأكيد نوعه",
    "files.carryOverRepSupervisorColumns": "أعمدة المندوب/المشرف",
    "files.carryOverRouteHierarchy": "ربط خط السير بالموظفين",
    "files.carryOverCascadedSingular": "تحديث {count} ملف تانية كانت بتشير له",
    "files.carryOverCascadedPlural": "تحديث {count} ملفات تانية كانت بتشير له",
    "files.carryOverSgi": "إعداد نمو المبيعات (SGI)",
    "files.replaceSuccessWithCarryOver": "تم الاستبدال، واتنقل تلقائي: {parts}",
    "files.replaceSuccess": "تم استبدال الملف",
    "files.skippedColumnsWarning": "الأعمدة دي مكانتش موجودة في الملف الجديد، لازم تعيد ربطها يدوي: {columns}",
    "files.replaceError": "تعذر استبدال الملف",
    "files.replaceFileTitle": "استبدال ملف",
    "files.hierarchyColumnsUpdateSuccess": "تم تحديث أعمدة الصلاحيات",
    "files.hierarchyColumnsUpdateError": "تعذر تحديث أعمدة الصلاحيات",
    "files.hierarchyColumnsConfigured": "أعمدة الصلاحيات متحددة — تعديل",
    "files.hierarchyColumnsSetPrompt": "تحديد عمود المندوب / المشرف (للصلاحيات ولشاشة أداء الفريق)…",
    "files.noHeadersDetected": "مفيش أعمدة اتكشفت لهذا الملف لسه.",
    "files.hierarchyColumnsExplanation": "اختر العمود اللي قيمته إيميل المندوب/المشرف على المنصة. الشخص ده هيشوف بعدها بس الصفوف اللي إيميله موجود فيها بهذا الملف. سيبها \"بلا\" عشان يفضل الملف ظاهر للكل. تحديد عمود المندوب هنا هو اللي بيخلي الملف يظهر في شاشة أداء الفريق.",
    "files.repColumnLabel": "عمود المندوب",
    "files.supervisorColumnLabel": "عمود المشرف",
    "files.managerColumnLabel": "عمود المدير",
    "files.cancel": "إلغاء",
    "files.save": "حفظ",
    "files.nonePlaceholder": "بلا",
    "files.noneOption": "— بلا —",
    "files.routeLinkSuccess": "تم ربط العمود بخط السير",
    "files.saveError": "تعذر الحفظ",
    "files.routeUnlinkSuccess": "تم إلغاء الربط بخط السير",
    "files.cancelError": "تعذر الإلغاء",
    "files.routeConfigured": "عمود المندوب مربوط بخط السير (Route) — تعديل",
    "files.routeLinkPrompt": "عمود \"{column}\" ده كود خط سير، مش إيميل؟ اربطه هنا…",
    "files.routeExplanation": "يعني إن عمود \"{column}\" في الملف ده مش فيه إيميل المندوب مباشرة، لكن فيه كود خط سير (Route). المندوب/المشرف بتاع كل خط سير موجود في ملف \"خطوط السير\". لو خط السير كمان بيحتوي على كود المندوب (مش إيميله) زي \"EMP001\"، اختار ملف \"المناديب\" تحت واحدد فيه عمود الكود وعمود الإيميل — النظام هيدور على الكود ده ويجيب الإيميل تلقائي.",
    "files.routesFileLabel": "ملف خطوط السير (Routes)",
    "files.chooseFilePlaceholder": "اختر الملف…",
    "files.routeIdColumnLabel": "عمود كود خط السير في هذا الملف",
    "files.routeRepColumnLabel": "عمود كود/إيميل المندوب في هذا الملف",
    "files.routeSupervisorColumnLabel": "عمود كود/إيميل المشرف (اختياري)",
    "files.employeesFileLabel": "ملف المناديب — اختياري، لو الكود في خطوط السير مش إيميل مباشر",
    "files.employeeIdColumnLabel": "عمود كود الموظف (EmployeeID)",
    "files.employeeEmailColumnLabel": "عمود إيميل الموظف",
    "files.employeeSupervisorEmailColumnLabel": "عمود إيميل مشرفه (بديل، لو مفيش عمود مشرف مباشر في خطوط السير)",
    "files.unlinkButton": "إلغاء الربط",
    "files.close": "إغلاق",
    "files.rowCountChip": "{count} صف",
    "files.columnCountChip": "{count} عمود",
    "files.periodChip": "{from} → {to}",
    "files.regionChip": "المنطقة: {values}",
    "files.branchChip": "الفرع: {values}",
    "files.salesRepChip": "المندوب: {values}",
    "files.routeChip": "المسار: {values}",
    "files.statusReady": "جاهز",
    "files.statusFailed": "فشل",
    "files.statusProcessing": "جارِ المعالجة",
    "files.confirmTypeSuccess": "تم تأكيد نوع الملف",
    "files.confirmTypeError": "تعذر تأكيد نوع الملف",
    "files.lowConfidenceNoGuess": "مقدرناش نصنف الملف ده بثقة. إيه هو؟",
    "files.lowConfidenceWithGuess": "مقدرناش نصنف الملف ده بثقة (أقرب تخمين: {type}، بثقة {percent}%). إيه هو؟",
    "files.confidenceGuessPrefix": "نعتقد إن ده",
    "files.confidenceGuessSuffix": "(بثقة {percent}%).",
    "files.confirm": "تأكيد",
    "files.correct": "صح كده",
    "files.updateSuccess": "تم تحديث الملف",
    "files.updateError": "تعذر تحديث الملف",
    "files.mixedWorkbookExplanation": "الملف ده شكله فيه أكتر من مجموعة بيانات جوا. اختر الشيت اللي عايز تستخدمه كـ",
    "files.unknownType": "نوع غير معروف",
    "files.sheetInfo": "— شكله {type}{confidencePart} · {count} صف",
    "files.useThisSheet": "استخدم هذا الشيت",
    "files.chooseTypePlaceholder": "اختر النوع…",
    "assistant.title": "مرشدك",
    "assistant.subtitle": "اسأل عن عملائك، مبيعاتك، وفرصك — يرد بأرقام حقيقية من ملفاتك مباشرة.",
    "assistant.suggestion1": "مين أكتر 10 عملاء تراجع بيعهم الشهر ده؟",
    "assistant.suggestion2": "حلل العميل 12",
    "assistant.suggestion3": "غدًا عندي مكة، جهزلي خطة اليوم",
    "assistant.inputPlaceholder": "اسأل عن عميل، منطقة، صنف، أو خطة اليوم...",
    "assistant.thinking": "بيحلل...",
    "assistant.errorFallback": "تعذر الوصول للمساعد الآن، حاول تاني.",
    "heatmap.title": "الخريطة الحرارية",
    "heatmap.subtitle":
      "كثافة المبيعات أو المرتجعات أو التحصيل أو العملاء جغرافيًا. اضبط الإعدادات مرة، وبعد كده استخدم مربع الطلب الحر تحت تحدّث الفلاتر تلقائيًا.",
    "heatmap.settingsTitle": "الإعدادات",
    "heatmap.scopeFieldLabel": "عمود النطاق (اختياري — منطقة/مندوب)",
    "heatmap.scopeFieldNone": "بلا (اختياري)",
    "heatmap.scopeValueLabel": "قيمة النطاق",
    "heatmap.scopeValueAll": "الكل",
    "heatmap.loading": "جاري التحميل…",
    "heatmap.metricLabel": "المقياس",
    "heatmap.metricSales": "كثافة المبيعات",
    "heatmap.metricReturns": "كثافة المرتجعات",
    "heatmap.metricCollection": "كثافة التحصيل",
    "heatmap.metricLostSales": "الفرص الضائعة (منتج بعينه)",
    "heatmap.metricOpportunity": "فرص التدخل (تراجع عميل ككل)",
    "heatmap.metricCustomerCount": "كثافة عدد العملاء",
    "heatmap.scopeRoute": "الخط (Route)",
    "heatmap.scopeCity": "المدينة",
    "heatmap.scopeCustomerClass": "فئة العميل",
    "heatmap.scopeChannel": "القناة",
    "heatmap.categoryFilterDisable": "إلغاء فلتر الفئة",
    "heatmap.categoryFilterEnable": "فلترة بفئة صنف (Category Distribution)",
    "heatmap.categoryLabel": "الفئة",
    "heatmap.categoryPlaceholder": "اختر فئة…",
    "heatmap.dateFromLabel": "من تاريخ (اختياري)",
    "heatmap.dateToLabel": "إلى تاريخ (اختياري)",
    "heatmap.lostSalesHint":
      'بيقارن فترتين: الأصناف اللي العميل اشتراها في الفترة الأولى ("قبل") ومكررهاش في الفترة الثانية ("حديثًا") — قيمتها بتتحسب كفرصة ضائعة.',
    "heatmap.opportunityHint":
      'بيقارن إجمالي مبيعات كل عميل في فترتين — لو المبيعات "حديثًا" أقل من "قبل"، الفرق ده بيتحسب فرصة تدخل، مش محصور في صنف بعينه.',
    "heatmap.priorWindowLabel": "الفترة الأولى (قبل — كان بيشتري فيها)",
    "heatmap.recentWindowLabel": "الفترة الحديثة",
    "heatmap.updateMapButton": "حدّث الخريطة",
    "heatmap.updatingButton": "جارٍ التحميل…",
    "heatmap.freeTextTitle": "اطلب بالكلام العادي",
    "heatmap.freeTextPlaceholder": 'مثال: "وريني بس منطقة الرياض" أو "قارن الشهر ده بس"',
    "heatmap.applyButton": "طبّق",
    "heatmap.freeTextHint": 'بيترجم طلبك لفلتر (منطقة/فترة/مقياس) على الإعدادات فوق — راجعه ثم اضغط "حدّث الخريطة".',
    "heatmap.resultTitle": "النتيجة",
    "heatmap.pointsBadge": "{count} نقطة",
    "heatmap.metricBadge": "المقياس: {metric}",
    "heatmap.totalBadge": "إجمالي: {total}",
    "heatmap.excludedBadge": "{count} صف مستبعد (إحداثيات غير صالحة)",
    "heatmap.generateDecisionsButton": "ولّد قرارات بالذكاء الاصطناعي",
    "heatmap.pointsToastSuccess": "{count} نقطة على الخريطة",
    "heatmap.interpretWarningFallback": "معرفتش أفهم الطلب، جرب تصيغه بشكل مختلف.",
    "heatmap.interpretSuccessFallback": "تم تطبيق الفلتر",
    "heatmap.interpretErrorFallback": "تعذر فهم الطلب",
    "heatmap.queryErrorFallback": "تعذر تحميل الخريطة",
    "heatmap.decisionErrorFallback": "تعذر توليد القرارات",
    "team.title": "الفريق",
    "team.subtitle": "تحكم في مين له صلاحية الدخول لمساحة العمل وإيه اللي يقدر يرفعه.",
    "team.tempPasswordTitle": "كلمة المرور المؤقتة لـ {email}",
    "team.tempPasswordNote": "مش هتتعرض تاني. ابعتها للمستخدم، وهيتطلب منه تغييرها أول ما يسجل دخول.",
    "team.tempPasswordAck": "تمام، اتحفظت",
    "team.addUser": "إضافة مستخدم",
    "team.addUserDialogTitle": "إضافة عضو للفريق",
    "team.fullNameLabel": "الاسم بالكامل",
    "team.emailLabel": "البريد الإلكتروني",
    "team.roleLabel": "الصلاحية",
    "team.chooseRole": "اختر صلاحية",
    "team.tempPasswordLabel": "كلمة مرور مؤقتة",
    "team.createUser": "إنشاء المستخدم",
    "team.members": "الأعضاء",
    "team.loading": "جارِ التحميل...",
    "team.nameHeader": "الاسم",
    "team.roleHeader": "الصلاحية",
    "team.branchHeader": "الفرع",
    "team.statusHeader": "الحالة",
    "team.joinedHeader": "تاريخ الانضمام",
    "team.noBranch": "بدون فرع",
    "team.statusPending": "قيد الانتظار",
    "team.statusActive": "نشط",
    "team.statusInvited": "تمت الدعوة",
    "team.statusSuspended": "موقوف",
    "team.statusLocked": "مقفول",
    "team.statusDisabled": "معطّل",
    "team.statusArchived": "مؤرشف",
    "team.disable": "تعطيل",
    "team.enable": "تفعيل",
    "team.resetPassword": "إعادة تعيين كلمة المرور",
    "team.revokeSessions": "إنهاء كل الجلسات",
    "team.delete": "حذف المستخدم",
    "team.deleteConfirm": "متأكد إنك عايز تحذف {email}؟ حسابه هيتقفل وجلساته هتنتهي فورًا، وهيختفي من القائمة.",
    "team.toastUserDeleted": "تم حذف المستخدم",
    "team.toastUserDeleteError": "تعذر حذف المستخدم",
    "team.toastUserInvited": "تمت دعوة المستخدم",
    "team.toastUserCreateError": "تعذر إنشاء المستخدم",
    "team.toastUserUpdateError": "تعذر تحديث المستخدم",
    "team.toastBranchUpdateError": "تعذر تحديث الفرع",
    "team.toastTempPasswordCreated": "تم إنشاء كلمة مرور مؤقتة",
    "team.toastPasswordResetError": "تعذر إعادة تعيين كلمة المرور",
    "team.toastSessionsRevoked": "تم إنهاء كل جلسات المستخدم",
    "team.toastSessionsRevokeError": "تعذر إنهاء الجلسات",
    "sgi.title": "إزاي تزوّد مبيعاتك",
    "sgi.subtitle": "أهم الفرص والمخاطر اللي تحتاج قرار منك النهارده.",
    "sgi.toastRecalculateSuccess": "تم الحساب — {count} موقف ({highCount} منهم أولوية عالية)",
    "sgi.toastRecalculateError": "تعذر تنفيذ الحساب",
    "sgi.toastRecalculateNowSuccess": "تم التحديث — {count} موقف ({highCount} منهم أولوية عالية)",
    "sgi.toastRecalculateNowError": "تعذر التحديث",
    "sgi.setupCardTitleCustomPeriod": "اختيار فترة مخصصة",
    "sgi.setupCardTitleFirstTime": "الإعدادات — أول مرة",
    "sgi.cancel": "إلغاء",
    "sgi.targetMonthLabel": "شهر الهدف",
    "sgi.dateFromLabel": "من تاريخ (الفترة الحالية)",
    "sgi.dateToLabel": "إلى تاريخ (الفترة الحالية)",
    "sgi.priorDateFromLabel": "من تاريخ (الفترة السابقة للمقارنة)",
    "sgi.priorDateToLabel": "إلى تاريخ (الفترة السابقة للمقارنة)",
    "sgi.calculateNow": "احسب الآن",
    "sgi.loadErrorMessage": "تعذّر تحميل بيانات نمو المبيعات. حاول تحديث الصفحة.",
    "sgi.emptyStateMessage": "لسه محدّش من مدير الشركة شغّل حساب المبيعات الذكي — كلّمه يضغط \"احسب الآن\".",
    "sgi.lastUpdatedPrefix": "آخر تحديث: {date}",
    "sgi.scopedToOwnTeamSuffix": " — مقتصر على فريقك",
    "sgi.refreshNow": "تحديث الآن",
    "sgi.customPeriod": "فترة مخصصة",
    "sgi.monthlyGoalTitle": "الهدف الشهري",
    "sgi.noTargetsMessage": "لسه مفيش أهداف مسجلة لشهر {month} — المبيعات المحققة لحد دلوقتي: {amount}.",
    "sgi.progressOf": "{actual} من {target}",
    "sgi.priorityCenterTitle": "مركز الأولويات",
    "employees.title": "الموظفون",
    "employees.subtitle": "السجل الرسمي لموظفي الشركة — مستقل تمامًا عن حسابات الدخول (المستخدمين). الموظف سجل عمل، مش حساب دخول.",
    "employees.addEmployee": "إضافة موظف",
    "employees.addEmployeeDialogTitle": "إضافة موظف جديد",
    "employees.employeeCodeLabel": "كود الموظف",
    "employees.fullNameLabel": "الاسم بالكامل",
    "employees.jobTitleLabel": "المسمى الوظيفي",
    "employees.branchLabel": "الفرع",
    "employees.noBranch": "بدون فرع",
    "employees.managerLabel": "المدير المباشر",
    "employees.noManagerDialog": "بدون مدير مباشر",
    "employees.contactEmailLabel": "بريد التواصل",
    "employees.contactPhoneLabel": "هاتف التواصل",
    "employees.addEmployeeSubmit": "إضافة الموظف",
    "employees.recordTitle": "سجل الموظفين",
    "employees.recordDescription": "الفرع والمدير المباشر هنا بيانات مرجعية بحتة — ربط الموظف بخطوط السير أو الأهداف أو العملاء مش جزء من هذه الشاشة.",
    "employees.loading": "جارِ التحميل...",
    "employees.empty": "لا يوجد موظفون مسجّلون بعد.",
    "employees.codeHeader": "الكود",
    "employees.nameHeader": "الاسم",
    "employees.jobTitleHeader": "المسمى الوظيفي",
    "employees.branchHeader": "الفرع",
    "employees.managerHeader": "المدير المباشر",
    "employees.linkedAccountHeader": "الحساب المرتبط",
    "employees.statusHeader": "الحالة",
    "employees.hireDateHeader": "تاريخ التعيين",
    "employees.noManagerRow": "بدون مدير",
    "employees.linked": "مرتبط",
    "employees.notLinked": "غير مرتبط",
    "employees.editData": "تعديل البيانات",
    "employees.unlinkAccount": "فك الربط بحساب المستخدم",
    "employees.linkAccount": "ربط بحساب: {email}",
    "employees.archive": "أرشفة",
    "employees.editDialogTitle": "تعديل بيانات {name}",
    "employees.hireDateLabel": "تاريخ التعيين",
    "employees.statusLabel": "الحالة",
    "employees.saveChanges": "حفظ التعديلات",
    "employees.toastEmployeeCreated": "تمت إضافة الموظف إلى السجل الرسمي",
    "employees.toastEmployeeCreateError": "تعذر إضافة الموظف",
    "employees.toastEmployeeUpdated": "تم تحديث بيانات الموظف",
    "employees.toastEmployeeUpdateError": "تعذر تحديث بيانات الموظف",
    "employees.toastEmployeeArchived": "تمت أرشفة الموظف",
    "employees.toastEmployeeArchiveError": "تعذر أرشفة الموظف",
    "employees.toastBranchUpdateError": "تعذر تحديث الفرع",
    "employees.toastManagerUpdateError": "تعذر تحديث المدير المباشر",
    "employees.toastUserLinked": "تم ربط الموظف بحساب المستخدم",
    "employees.toastLinkError": "تعذر الربط",
    "employees.toastUnlinked": "تم فك الربط",
    "employees.toastUnlinkError": "تعذر فك الربط",
    "employees.statusDraft": "مسودة",
    "employees.statusActive": "نشط",
    "employees.statusOnLeave": "إجازة",
    "employees.statusSuspended": "موقوف",
    "employees.statusInactive": "غير نشط",
    "employees.statusArchived": "مؤرشف",
    "settings.title": "الإعدادات",
    "settings.subtitle": "تحكم في بيانات شركتك، إعدادات الـ Custom GPT، والفوترة.",
    "settings.tabCompany": "الشركة",
    "settings.tabBranches": "الفروع",
    "settings.tabDataSources": "مصادر البيانات",
    "settings.tabPolicies": "السياسات والامتثال",
    "settings.tabAccount": "الحساب",
    "settings.tabBilling": "الفوترة",
    "settings.loading": "جارِ التحميل...",
    "settings.save": "حفظ",
    "settings.saveChanges": "حفظ التغييرات",
    "settings.cancel": "إلغاء",
    "settings.edit": "تعديل",
    "settings.define": "تعريف",
    "settings.add": "إضافة",
    "settings.archive": "أرشفة",
    "settings.delete": "حذف",
    "settings.activate": "تفعيل",
    "settings.suspend": "تعليق",
    "settings.statusHeader": "الحالة",
    "settings.nameHeader": "الاسم",
    "settings.statusActiveGeneric": "نشط",
    "settings.statusArchivedGeneric": "مؤرشف",
    "settings.companyDataTitle": "بيانات الشركة",
    "settings.companyNameLabel": "اسم الشركة",
    "settings.companyUpdateSuccess": "تم تحديث بيانات الشركة",
    "settings.companyUpdateError": "تعذر تحديث بيانات الشركة",
    "settings.profileTitle": "بيانات إضافية",
    "settings.profileDescription": "الدولة، المدينة، المنطقة الزمنية، العملة، وبيانات التواصل الخاصة بالشركة.",
    "settings.countryLabel": "الدولة",
    "settings.cityLabel": "المدينة",
    "settings.timeZoneLabel": "المنطقة الزمنية",
    "settings.currencyLabel": "العملة",
    "settings.defaultLanguageLabel": "اللغة الافتراضية",
    "settings.fiscalYearStartLabel": "بداية السنة المالية",
    "settings.contactEmailLabel": "بريد التواصل",
    "settings.contactPhoneLabel": "هاتف التواصل",
    "settings.profileUpdateSuccess": "تم تحديث بيانات الشركة الإضافية",
    "settings.profileUpdateError": "تعذر تحديث البيانات",
    "settings.discoveryTitle": "مزود اكتشاف العملاء",
    "settings.discoveryDescription": "اختار الخدمة اللي بيستخدمها زر «ابحث حولي» في مساعد الزيارات لاكتشاف عملاء جدد حواليك.",
    "settings.discoveryOsmLabel": "OpenStreetMap (الافتراضي — مجاني)",
    "settings.discoveryOsmDescription": "مجاني بالكامل ولا يحتاج أي مفتاح أو حساب.",
    "settings.discoveryGoogleLabel": "Google Places",
    "settings.discoveryGoogleDescription":
      "الخدمة دي مش مقدمة من المنصة ولا بتتحمل تكلفتها — بتستخدم حساب الفوترة الخاص بشركتك مباشرة.",
    "settings.discoveryApiKeyLabel": "مفتاح Google Places API",
    "settings.discoveryApiKeySavedPlaceholder": "•••• محفوظ",
    "settings.discoveryApiKeyPlaceholder": "أدخل المفتاح هنا",
    "settings.discoveryClearKey": "مسح المفتاح",
    "settings.discoveryKeyRequiredHint": "لازم تدخل مفتاح Google Places API الأول علشان تقدر تختار Google Places.",
    "settings.discoveryUpdateSuccess": "تم تحديث إعدادات اكتشاف العملاء",
    "settings.discoveryUpdateError": "تعذر تحديث إعدادات اكتشاف العملاء",
    "settings.addBranchTitle": "إضافة فرع جديد",
    "settings.addBranchDescription":
      "الفرع هو المستوى التنظيمي الحالي للشركة. مستقبلًا هيتم دعم مستويات إضافية (منطقة، مركز توزيع) بدون أي تغيير هنا.",
    "settings.branchCodeLabel": "كود الفرع",
    "settings.branchNameLabel": "اسم الفرع",
    "settings.currentBranchesTitle": "الفروع الحالية",
    "settings.noBranchesYet": "لا يوجد فروع مسجّلة بعد.",
    "settings.codeHeader": "الكود",
    "settings.branchAddSuccess": "تم إضافة الفرع",
    "settings.branchAddError": "تعذر إضافة الفرع",
    "settings.branchArchiveSuccess": "تم أرشفة الفرع",
    "settings.branchArchiveError": "تعذر أرشفة الفرع",
    "settings.dsStatusDraft": "مسودة",
    "settings.dsStatusConfiguring": "قيد الإعداد",
    "settings.dsStatusConnected": "متصل",
    "settings.dsStatusSuspended": "موقوف",
    "settings.healthHealthy": "سليم",
    "settings.healthWarning": "تحذير",
    "settings.healthError": "خطأ",
    "settings.healthOffline": "غير متصل",
    "settings.refreshQueued": "في الانتظار",
    "settings.refreshRunning": "قيد التنفيذ",
    "settings.refreshCompleted": "مكتمل",
    "settings.refreshFailed": "فشل",
    "settings.authNone": "بدون مصادقة",
    "settings.authBasic": "اسم مستخدم وكلمة مرور",
    "settings.authApiKey": "مفتاح API",
    "settings.connHost": "المضيف (Host)",
    "settings.connPort": "المنفذ (Port)",
    "settings.connDatabase": "قاعدة البيانات",
    "settings.connBaseUrl": "رابط الـ API الأساسي",
    "settings.connBucket": "اسم الـ Bucket",
    "settings.dataSourcesIntro":
      "تعريف وإدارة مصادر بيانات الشركة فقط (اسم المصدر، النوع، بيانات الاتصال). رفع الملفات أو تحديث البيانات نفسها مش جزء من هذه الشاشة — هيتم التعامل معها لاحقًا في مركز التحديث (Refresh Center).",
    "settings.addDataSource": "إضافة مصدر بيانات",
    "settings.addDataSourceDialogTitle": "إضافة مصدر بيانات جديد",
    "settings.dsNameLabel": "اسم المصدر",
    "settings.dsTypeLabel": "نوع المصدر",
    "settings.dsTypePlaceholder": "اختر النوع",
    "settings.dsDescriptionLabel": "الوصف",
    "settings.dsCategoryLabel": "فئة الملف/البيانات",
    "settings.dsCategoryPlaceholder": "عملاء، فواتير، مدفوعات، ...",
    "settings.authMethodLabel": "طريقة المصادقة",
    "settings.ownerLabel": "الجهة المالكة",
    "settings.noOwner": "بدون مالك",
    "settings.connectionFieldsTitle": "بيانات الاتصال (اختياري — حسب النوع)",
    "settings.credentialsTitle": "بيانات الاعتماد (اختياري — بتتخزن مشفّرة ومش هتتعرض تاني)",
    "settings.credUsernameLabel": "اسم المستخدم / المفتاح",
    "settings.credSecretLabel": "كلمة المرور / السر",
    "settings.addDataSourceSubmit": "إضافة المصدر",
    "settings.registeredDataSourcesTitle": "مصادر البيانات المسجّلة",
    "settings.noDataSourcesYet": "لا يوجد مصادر بيانات مسجّلة بعد.",
    "settings.typeHeader": "النوع",
    "settings.categoryHeader": "الفئة",
    "settings.healthHeader": "الصحة",
    "settings.lastRefreshHeader": "آخر تحديث",
    "settings.neverRefreshed": "لم يُحدَّث بعد",
    "settings.runRefreshNow": "تشغيل تحديث الآن",
    "settings.testConnection": "اختبار الاتصال",
    "settings.confirmDeleteDataSource": 'هل أنت متأكد من حذف مصدر البيانات "{name}"؟',
    "settings.refreshHistoryTitle": "سجل عمليات التحديث",
    "settings.refreshHistoryDescription":
      "كل عملية تحديث بتتحقق من البنية التنظيمية للشركة ثم تتحقق من توفر ملفات كل فئة بيانات متوقعة (Full Refresh فقط في هذا الإصدار) — لا تُنشئ أو تعدّل أي بيانات عملاء/فواتير فعلية.",
    "settings.noRefreshRunsYet": "لا يوجد عمليات تحديث بعد.",
    "settings.sourceHeader": "المصدر",
    "settings.dataQualityHeader": "درجة جودة البيانات",
    "settings.missingFilesHeader": "ملفات ناقصة",
    "settings.listSeparator": "، ",
    "settings.durationHeader": "المدة",
    "settings.runDateHeader": "تاريخ التشغيل",
    "settings.durationSeconds": "{value} ث",
    "settings.dataSourceAddSuccess": "تم إضافة مصدر البيانات",
    "settings.dataSourceAddError": "تعذر إضافة مصدر البيانات",
    "settings.dataSourceStatusUpdateError": "تعذر تحديث الحالة",
    "settings.dataSourceTestError": "تعذر اختبار الاتصال",
    "settings.refreshSuccessMessage": "اكتمل التحديث — درجة جودة البيانات: {score}%",
    "settings.refreshFailureMessage": "فشل التحديث — راجع سجل عمليات التحديث للتفاصيل",
    "settings.refreshTriggerError": "تعذر تشغيل التحديث",
    "settings.dataSourceDeleteSuccess": "تم حذف مصدر البيانات",
    "settings.dataSourceDeleteError": "تعذر الحذف — يجب تعليق المصدر أولاً إذا كان نشطًا",
    "settings.policyTypeOrganizational": "السياسة التنظيمية",
    "settings.policyTypePassword": "سياسة كلمات المرور",
    "settings.policyTypeRefresh": "سياسة التحديث",
    "settings.policyTypeEmployeeAssignment": "سياسة تعيين الموظفين",
    "settings.policyTypePermission": "سياسة الصلاحيات",
    "settings.policyTypeArchiving": "سياسة الأرشفة",
    "settings.policySaveSuccess": "تم حفظ السياسة",
    "settings.policySaveError": "تعذر حفظ السياسة",
    "settings.invalidJson": "الصيغة غير صحيحة — لازم تكون JSON صالح",
    "settings.companyPoliciesTitle": "سياسات الشركة",
    "settings.companyPoliciesDescription":
      "المرجع الرسمي لسياسات الشركة — تفسيرها وتطبيقها يبقى مسؤولية المحرك المعني بها. تعديل سياسة كلمة المرور هنا حاليًا لا يغيّر آليًا قواعد التحقق الفعلية في تسجيل الدخول، وده موضّح في تقرير هذه المرحلة.",
    "settings.policyHeader": "السياسة",
    "settings.versionHeader": "الإصدار",
    "settings.policyEnabled": "مُفعّلة",
    "settings.policyDisabled": "غير مُفعّلة",
    "settings.policyUndefined": "غير مُعرَّفة",
    "settings.policyContentDescription": "محتوى السياسة (JSON) — الشكل حر لأن كل نوع سياسة له إعدادات مختلفة.",
    "settings.complianceOverviewTitle": "نظرة عامة على الامتثال",
    "settings.complianceOverviewDescription":
      "يعرض فقط ما إذا كانت كل سياسة مُعرَّفة ومُفعّلة أم لا — التحقق العميق من التزام كل مستخدم/سجل بالسياسة تفصيليًا غير متاح بعد.",
    "settings.fullyCompliant": "متوافقة بالكامل",
    "settings.hasUndefinedPolicies": "يوجد سياسات غير مُعرَّفة",
    "settings.compliant": "متوافقة",
    "settings.nonCompliant": "غير متوافقة",
    "settings.changePasswordTitle": "تغيير كلمة المرور",
    "settings.changePasswordDescription": "تغيير كلمة المرور بيسجّل خروجك تلقائيًا من أي جهاز تاني مسجّل دخول.",
    "settings.currentPasswordLabel": "كلمة المرور الحالية",
    "settings.newPasswordLabel": "كلمة المرور الجديدة",
    "settings.changePasswordSuccess": "تم تغيير كلمة المرور. هيتم تسجيل خروجك من باقي الأجهزة.",
    "settings.changePasswordError": "تعذر تغيير كلمة المرور",
    "settings.gptSettingsTitle": "إعدادات GPT",
    "settings.gptSettingsDescription":
      "الاسم ومفتاح الـ API المستخدمين في التحقق من الـ Action. رابط الـ Custom GPT نفسه بيحدده Super Admin على مستوى المنصة كلها.",
    "settings.gptNameLabel": "اسم الـ GPT",
    "settings.apiKeyIdLabel": "معرّف مفتاح API: {id}",
    "settings.regenerateApiKey": "توليد مفتاح API جديد",
    "settings.gptSaveSuccess": "تم حفظ إعدادات Custom GPT",
    "settings.gptSaveError": "تعذر حفظ الإعدادات",
    "settings.regenerateSuccess": "تم توليد مفتاح API جديد",
    "settings.regenerateError": "تعذر توليد المفتاح",
    "settings.saveApiKeyNowTitle": "احفظ مفتاح الـ API ده دلوقتي",
    "settings.saveApiKeyNowDescription": "مش هيتعرض تاني. الصقه في إعدادات المصادقة بتاعة الـ Action.",
    "settings.paymentSucceeded": "ناجحة",
    "settings.paymentFailed": "فشلت",
    "settings.paymentPending": "قيد الانتظار",
    "settings.subTrial": "فترة تجريبية",
    "settings.subActive": "نشط",
    "settings.subExpired": "منتهي",
    "settings.subSuspended": "موقوف",
    "settings.currentPlanTitle": "الخطة الحالية",
    "settings.pricePerMonth": "{price}/شهريًا",
    "settings.paymentHistoryTitle": "سجل المدفوعات",
    "settings.noPaymentsYet": "مفيش مدفوعات مسجّلة لسه.",
    "settings.dateHeader": "التاريخ",
    "settings.amountHeader": "المبلغ",
    "customerComparison.title": "مقارنة العملاء",
    "customerComparison.subtitle":
      "اختار عميل حالي، والنظام يطلع الأصناف اللي بيشتريها أقرب العملاء الجغرافيين ليه — ومش موجودة عنده خالص. فرصة بيع إضافي (Upsell) مبنية على بيانات حقيقية.",
    "customerComparison.settingsTitle": "الإعدادات",
    "customerComparison.targetCustomerLabel": "العميل المطلوب مقارنته",
    "customerComparison.searchPlaceholder": "دور بالاسم أو الكود…",
    "customerComparison.customersLoadError": "تعذر تحميل قائمة العملاء",
    "customerComparison.noResults": "مفيش نتائج",
    "customerComparison.nearestCountLabel": "عدد أقرب الجيران للمقارنة",
    "customerComparison.compareButton": "قارن",
    "customerComparison.compareSuccessToast": "تمت المقارنة — {gapCount} صنف مفقود من {neighborCount} جار",
    "customerComparison.compareErrorFallback": "تعذر إتمام المقارنة",
    "customerComparison.talkingPointsErrorFallback": "تعذر توليد نقاط الحديث",
    "customerComparison.resultTitle": "النتيجة",
    "customerComparison.targetCustomerBadge": "العميل: {name}",
    "customerComparison.neighborsBadge": "{count} جار",
    "customerComparison.targetProductCountBadge": "{count} صنف بيشتريه العميل بالفعل",
    "customerComparison.gapProductsBadge": "{count} صنف مفقود (فرصة بيع)",
    "customerComparison.excludedBadge": "{count} عميل تم تجاهله (إحداثيات غير صالحة)",
    "customerComparison.mapTitle": "العميل والجيران على الخريطة",
    "customerComparison.mapCenterLabel": "العميل المستهدف",
    "customerComparison.mapNeighborLabel": "جار (أقرب العملاء)",
    "customerComparison.gapTableTitle": "أصناف بيشتريها الجيران ومش موجودة عند العميل ده",
    "customerComparison.noGapMessage": "مفيش فجوة — العميل ده بيشتري كل حاجة بيشتريها جيرانه تقريبًا.",
    "customerComparison.colProduct": "الصنف",
    "customerComparison.colCategory": "التصنيف",
    "customerComparison.colTotalQty": "إجمالي الكمية عند الجيران",
    "customerComparison.colTotalValue": "إجمالي القيمة عند الجيران",
    "customerComparison.colCustomerCount": "عدد الجيران المشترين",
    "customerComparison.talkingPointsTitle": "نقاط حديث للبيع الإضافي (اختياري)",
    "customerComparison.talkingPointsDescription":
      "يحلل الذكاء الاصطناعي جدول الفجوة اللي طلع فوق ويكتب للمندوب ملخص قصير + جمل عملية يقدر يقولها للعميل عشان يقنعه يجرب الأصناف اللي جيرانه بيشتروها ومجربهاش.",
    "customerComparison.generateTalkingPointsButton": "ولّد نقاط حديث بالذكاء الاصطناعي",
    "analysisStudio.__reserved": "",
    "customerLocations.__reserved": "",
    "newCustomer.__reserved": "",
    "routePlanning.__reserved": "",
    "visitEfficiency.__reserved": "",
    "teamPerformance.title": "أداء الفريق",
    "teamPerformance.descriptionSupervisor": "مبيعات وتحصيل ومرتجعات مناديبك في الفترة اللي تختارها.",
    "teamPerformance.descriptionManager": "مبيعات وتحصيل ومرتجعات الفريق، مجمّعة تحت كل مشرف.",
    "teamPerformance.repCount": "{count} مندوب",
    "teamPerformance.loadError": "تعذر تحميل أداء الفريق",
    "teamPerformance.settingsTitle": "الإعدادات",
    "teamPerformance.dateFromLabel": "من تاريخ",
    "teamPerformance.dateToLabel": "إلى تاريخ",
    "teamPerformance.compareEnableButton": "قارن بفترة سابقة (لإظهار الاتجاه)",
    "teamPerformance.compareDisableButton": "إلغاء المقارنة بفترة سابقة",
    "teamPerformance.priorDateFromLabel": "من تاريخ (فترة المقارنة)",
    "teamPerformance.priorDateToLabel": "إلى تاريخ (فترة المقارنة)",
    "teamPerformance.showPerformanceButton": "عرض الأداء",
    "teamPerformance.exportExcelButton": "تصدير Excel",
    "teamPerformance.categorySales": "المبيعات",
    "teamPerformance.categoryCollection": "التحصيل",
    "teamPerformance.categoryReturns": "المرتجعات",
    "teamPerformance.categoryUnavailableBadge": "بيانات {category} غير متاحة",
    "teamPerformance.flatViewTitle": "فريقك",
    "teamPerformance.treeViewTitle": "الفريق حسب المشرف",
    "teamPerformance.emptyReps": "مفيش مناديب ظهروا بالفلاتر دي.",
    "teamPerformance.noSupervisor": "بدون مشرف محدد",
    "teamPerformance.salesValue": "مبيعات: {value}",
    "teamPerformance.salesEmpty": "مبيعات: —",
    "teamPerformance.salesUnavailable": "مبيعات: غير متاح",
    "teamPerformance.collectionValue": "تحصيل: {value}",
    "teamPerformance.collectionUnavailable": "تحصيل: غير متاح",
    "teamPerformance.returnsValue": "مرتجعات: {value}",
    "teamPerformance.returnsUnavailable": "مرتجعات: غير متاح",
    "teamPerformance.coachButton": "توجيه",
    "teamPerformance.coachError": "تعذر توليد التوجيه",
    "teamPerformance.colRep": "المندوب",
    "teamPerformance.colEmail": "البريد الإلكتروني",
    "teamPerformance.colSupervisor": "المشرف",
    "teamPerformance.colSales": "مبيعات",
    "teamPerformance.colSalesPrior": "مبيعات (الفترة السابقة)",
    "teamPerformance.colSalesChangePct": "نسبة تغيّر المبيعات %",
    "teamPerformance.colCollection": "تحصيل",
    "teamPerformance.colCollectionRatePct": "نسبة التحصيل من المبيعات %",
    "teamPerformance.colReturns": "مرتجعات",
    "teamPerformance.colReturnRatePct": "نسبة المرتجعات من المبيعات %",
    "teamPerformance.notAvailable": "غير متاح",
    "teamPerformance.sheetName": "أداء الفريق",
    "teamPerformance.fileName": "أداء-الفريق.xlsx",
    "copilot.title": "مساعد الزيارات",
    "copilot.subtitle": "خطة يومك وزياراتك — كل حاجة تحتاجها قبل ما تدخل للعميل.",
    "copilot.periodLabel": "الفترة",
    "copilot.period1m": "آخر شهر",
    "copilot.period3m": "آخر 3 أشهر",
    "copilot.period6m": "آخر 6 أشهر",
    "copilot.period12m": "آخر 12 شهر",
    "copilot.periodCustom": "فترة مخصصة",
    "copilot.fromLabel": "من تاريخ",
    "copilot.toLabel": "إلى تاريخ",
    "copilot.customPeriodHint": "اختار تاريخ البداية والنهاية الأول.",
    "copilot.vanStockLabel": "مراعاة مخزون السيارة",
    "copilot.notWorkingDay": "النهارده مش يوم شغل حسب الجدول — الخطة استرشادية.",
    "copilot.visitsLabel": "زيارات النهارده",
    "copilot.dailyTargetLabel": "هدف اليوم",
    "copilot.noTarget": "مفيش هدف محدد",
    "copilot.expectedSalesLabel": "مبيعات متوقعة",
    "copilot.distanceLabel": "المسافة التقريبية",
    "copilot.durationLabel": "الوقت التقريبي",
    "copilot.kmValue": "{value} كم",
    "copilot.minValue": "{value} دقيقة",
    "copilot.planRoute": "ترتيب جغرافي (أقصر مسافة)",
    "copilot.planPriority": "أولوية بيعية (أعلى أثر)",
    "copilot.briefLoadError": "معرفناش نجيب خطة اليوم",
    "copilot.planError": "معرفناش نرتّب الخطة",
    "copilot.customersTitle": "عملاء النهارده",
    "copilot.noCustomers": "مفيش عملاء في خط سير النهارده.",
    "copilot.avgOrder": "متوسط الفاتورة: {value}",
    "copilot.back": "رجوع للقايمة",
    "copilot.salesLabel": "المبيعات",
    "copilot.invoiceCount": "{count} فاتورة",
    "copilot.returnsLabel": "المرتجعات",
    "copilot.returnRate": "{value}% من المبيعات",
    "copilot.pendingLabel": "تحصيل معلّق",
    "copilot.trendLabel": "الاتجاه",
    "copilot.topProductsTitle": "أكتر المنتجات",
    "copilot.actionsTitle": "خطوات الزيارة",
    "copilot.briefingLoadError": "معرفناش نجيب ملخص العميل",
    "copilot.chatTitle": "اسأل مرشدك عن العميل ده",
    "copilot.chatPlaceholder": "اسأل أي حاجة عن العميل…",
    "copilot.chatError": "حصلت مشكلة، جرّب تاني",
    "copilot.thinking": "بيفكّر…",
    "copilot.discoverButton": "اكتشف فرصًا جديدة",
    "copilot.discoveryTitle": "اكتشاف عملاء جدد",
    "copilot.discoveryLoadError": "معرفناش نجيب فرص الاكتشاف",
    "copilot.mapLoading": "بنحمّل الخريطة…",
    "copilot.googleSearchButton": "ابحث حولي",
    "copilot.googleSearchResult": "لقينا {found}، منهم {newCount} جديد",
    "copilot.googleSearchDisabled": "البحث حواليك مش متاح دلوقتي",
    "copilot.geoFallbackNotice": "معرفناش نحدد موقعك — هندوّر حوالين عملاء خطك",
    "copilot.geoUnavailable": "مفيش موقع نبحث حواليه دلوقتي",
    "copilot.legendExisting": "عميل حالي",
    "copilot.legendNew": "فرصة جديدة",
    "copilot.legendVisited": "تمت زيارتها",
    "copilot.legendIgnored": "متجاهلة",
    "copilot.legendConverted": "اتحولت لعميل",
    "copilot.popupScore": "الأولوية: {value}",
    "copilot.popupExpected": "قيمة متوقعة: {value}",
    "copilot.popupProbability": "احتمال النجاح: {value}%",
    "copilot.popupDistance": "المسافة: {value} كم",
    "copilot.startVisit": "ابدأ الزيارة",
    "copilot.ignore": "تجاهل",
    "copilot.ignoredToast": "اتجاهلت الفرصة",
    "copilot.statusError": "معرفناش نحدّث حالة الفرصة",
    "copilot.oppFound": "وجدنا داخل نطاق جولتك اليوم: {high} فرص عالية، {medium} متوسطة",
    "copilot.oppBest": "لو أضفت أفضل فرصتين: +{value} ريال متوقعة، +{minutes} دقيقة، +{km} كم",
    "copilot.oppShowMap": "عرض الفرص على الخريطة",
    "copilot.prospectBadge": "عميل محتمل",
    "copilot.markVisited": "علّم كزيارة تمت",
    "copilot.markedVisited": "اتعلّمت كزيارة تمت",
  },
  en: {
    "nav.overview": "Overview",
    "nav.assistant": "Assistant",
    "nav.analysisStudio": "Analysis Studio",
    "nav.files": "Files",
    "nav.routePlanning": "Route Planning",
    "nav.heatmap": "Heat Map",
    "nav.newCustomer": "New Customer",
    "nav.customerComparison": "Customer Comparison",
    "nav.customerSimilarity": "Performance Similarity",
    "nav.visitEfficiency": "Visit Efficiency",
    "nav.customerLocations": "Customer Locations",
    "nav.teamPerformance": "Team Performance",
    "nav.sgi": "Grow Your Sales",
    "nav.visitCopilot": "Visit Copilot",
    "nav.team": "Team",
    "nav.employees": "Employees",
    "nav.settings": "Settings",
    "shell.brand": "Murshidak",
    "shell.tagline": "Sales Intelligence in Your Hands",
    "shell.logout": "Log out",
    "shell.searchPlaceholder": "Search a screen or feature…",
    "group.data": "Data",
    "group.aiInsights": "AI & Insights",
    "group.customersTerritory": "Customers & Territory",
    "group.team": "Team",
    "group.system": "System",
    "language.switchTo": "العربية",
    "customerSimilarity.title": "Customers Similar in Performance",
    "customerSimilarity.subtitle":
      'Group customers by their purchase performance and behavior — not location — to surface segments like "big spenders who rarely order" or "frequent small buyers".',
    "customerSimilarity.settingsCard": "Settings",
    "customerSimilarity.noFiles": "Upload a customer file (with coordinates) and a sales file from the Files page first.",
    "customerSimilarity.customerFileLabel": "Customer file",
    "customerSimilarity.chooseFile": "Choose a file…",
    "customerSimilarity.chooseCategory": "Choose a category…",
    "customerSimilarity.latColumn": "Latitude column",
    "customerSimilarity.lonColumn": "Longitude column",
    "customerSimilarity.idColumn": "Customer ID column",
    "customerSimilarity.nameColumnOptional": "Name column (optional)",
    "customerSimilarity.scopeColumnOptional": "Scope column (optional)",
    "customerSimilarity.clusterCountLabel": "Number of behavior groups",
    "customerSimilarity.scopeValuesLabel": "Scope values (optional — leave empty for all)",
    "customerSimilarity.salesSectionLabel": "Performance file (builds the similarity fingerprint)",
    "customerSimilarity.salesCustomerIdColumn": "Customer ID column",
    "customerSimilarity.salesAmountColumn": "Amount column",
    "customerSimilarity.salesSkuColumnOptional": "SKU column (optional)",
    "customerSimilarity.similarityBasisLabel": "Similarity basis",
    "customerSimilarity.basisSales": "Total sales",
    "customerSimilarity.basisCollection": "Collection",
    "customerSimilarity.basisReturns": "Returns",
    "customerSimilarity.categoryFilterToggleOn": "Narrow to one product category (optional) — enable",
    "customerSimilarity.categoryFilterToggleOff": "Clear category filter (back to total sales)",
    "customerSimilarity.categoryColumnLabel": "Category column",
    "customerSimilarity.categoryValueLabel": "Category value (e.g. Biscuits)",
    "customerSimilarity.collectionSectionLabel": "Collection file (builds the similarity fingerprint)",
    "customerSimilarity.returnsSectionLabel": "Returns file (builds the similarity fingerprint)",
    "customerSimilarity.avgValueSales": "Avg. spend",
    "customerSimilarity.avgValueCollection": "Avg. collected",
    "customerSimilarity.avgValueReturns": "Avg. returns value",
    "customerSimilarity.runButton": "Group now",
    "customerSimilarity.runningButton": "Grouping…",
    "customerSimilarity.resultCard": "Result",
    "customerSimilarity.customersBadge": "{count} customers",
    "customerSimilarity.excludedBadge": "{count} customers without enough performance data",
    "customerSimilarity.legendGroup": "Group {n}",
    "customerSimilarity.tableGroup": "Group",
    "customerSimilarity.tableCustomers": "Customers",
    "customerSimilarity.tableAvgSpend": "Avg. spend",
    "customerSimilarity.tableAvgOrders": "Avg. order count",
    "customerSimilarity.tableAvgSkuVariety": "Avg. SKU variety",
    "customerSimilarity.exportButton": "Export Excel (full detail)",
    "customerSimilarity.memberIdHeader": "Customer ID",
    "customerSimilarity.memberNameHeader": "Name",
    "customerSimilarity.memberValueHeader": "Value",
    "customerSimilarity.toastSuccess": "{count} customers in {clusters} behavior groups",
    "customerSimilarity.toastError": "Could not run the grouping",
    "customerSimilarity.noCustomersInGroup": "No customers in this group with the current filters.",
    "customerSimilarity.groupFilterLabel": "Groups shown on map",
    "customerSimilarity.groupFilterAll": "All",
    "customerSimilarity.groupFilterCount": "{count} of {total}",
    "dashboard.greeting": "Welcome back, {name}",
    "dashboard.greetingNoName": "Welcome back",
    "dashboard.statusTrial": "{days} days left in your trial",
    "dashboard.statusActive": "Your subscription is active and fully enabled",
    "dashboard.statusExpired": "Your subscription has expired — some features are disabled until renewal",
    "dashboard.statusSuspended": "Your subscription is temporarily suspended",
    "dashboard.heroCta": "Open Murshidak",
    "dashboard.kpiActiveFiles": "Active files",
    "dashboard.kpiLastUpload": "Last file uploaded",
    "dashboard.kpiLastUploadNone": "None yet",
    "dashboard.kpiSubscription": "Subscription status",
    "dashboard.kpiTrialDays": "Trial days remaining",
    "dashboard.kpiTrialDaysUnit": "days",
    "dashboard.aiCardTitle": "Murshidak",
    "dashboard.aiCardBody": "Ask about your customers, sales, and opportunities — Murshidak answers with real numbers from your own files, right inside the platform.",
    "dashboard.aiCardCta": "Open Murshidak",
    "dashboard.filesCardTitle": "Active files",
    "dashboard.filesCardManage": "Manage files",
    "dashboard.filesEmptyTitle": "No files uploaded yet",
    "dashboard.filesEmptyReason": "Murshidak needs at least one data file to analyze and answer your questions.",
    "dashboard.filesEmptyAction": "Upload your first file",
    "dashboard.quickActionsTitle": "Quick actions",
    "dashboard.quickActionFiles": "Files",
    "dashboard.quickActionAssistant": "Murshidak",
    "dashboard.quickActionHeatmap": "Heat Map",
    "dashboard.quickActionSgi": "Grow Your Sales",
    "files.title": "Files",
    "files.subtitle": "Upload your Excel files — no need to specify the type, the system reads the columns and detects it automatically.",
    "files.activeCount": "{active} / {max} active",
    "files.uploadedFiles": "Uploaded Files",
    "files.pendingConfirmation": "{count} need your confirmation",
    "files.empty": "No files uploaded yet. Upload a file above to get started.",
    "files.deleteSuccess": "File deleted",
    "files.deleteError": "Failed to delete file",
    "files.downloadUrlError": "Failed to create download link",
    "files.confidenceSuffix": " ({percent}% confidence)",
    "files.classifiedSuccess": "✓ {fileName} — detected as {datasetType}{confidence}",
    "files.needsConfirmation": "{fileName} needs quick confirmation below",
    "files.uploadFailed": "One of the files failed to upload",
    "files.validationRejected": "\"{fileName}\" was rejected — closest official Import Template is \"{entity}\" with {count} error(s). Example: {detail}",
    "files.targetCompanyLabel": "Target company",
    "files.targetCompanyPlaceholder": "Choose a company…",
    "files.targetCompanyHint": "Pick the target company before uploading — your Super Admin account belongs to no company.",
    "files.batchEntitiesCount": "{count} entities",
    "files.batchAccepted": "\"{fileName}\" — accepted {accepted} of {attempted}: {entities}",
    "files.batchAcceptedMore": "and {count} more",
    "files.batchRejected": "\"{fileName}\" — {count} sheet(s) rejected: {details}",
    "files.replaceOtherAccepted": "+ {count} other entities accepted from the same file",
    "files.dropzoneText": "Drag and drop an Excel file (or more) here, or",
    "files.classifying": "Classifying {count}…",
    "files.chooseFiles": "Choose Files",
    "files.atLimit": "You've reached the maximum number of active files. Delete a file to upload another.",
    "files.provisionTitle": "New employee accounts created",
    "files.provisionWarning": "These temporary passwords are shown once only and won't appear again — copy and distribute them before closing.",
    "files.provisionCopyAll": "Copy all",
    "files.provisionCopied": "All accounts copied",
    "files.provisionDismiss": "Done — close permanently",
    "files.provisionUpdatedCount": "Updated {count} existing account(s)",
    "files.provisionSkippedCount": "Skipped {count} row(s):",
    "files.provisionName": "Name",
    "files.provisionEmail": "Email",
    "files.provisionRole": "Role",
    "files.provisionPassword": "Temp password",
    "files.replaceUploadedNeedsConfirm": "New file uploaded — still needs type confirmation",
    "files.carryOverRepSupervisorColumns": "Rep/supervisor columns",
    "files.carryOverRouteHierarchy": "Route-to-employee linking",
    "files.carryOverCascadedSingular": "Updated {count} other file that referenced it",
    "files.carryOverCascadedPlural": "Updated {count} other files that referenced it",
    "files.carryOverSgi": "Sales growth (SGI) setup",
    "files.replaceSuccessWithCarryOver": "Replaced successfully, and carried over automatically: {parts}",
    "files.replaceSuccess": "File replaced",
    "files.skippedColumnsWarning": "These columns weren't found in the new file, you'll need to re-link them manually: {columns}",
    "files.replaceError": "Failed to replace file",
    "files.replaceFileTitle": "Replace file",
    "files.hierarchyColumnsUpdateSuccess": "Permission columns updated",
    "files.hierarchyColumnsUpdateError": "Failed to update permission columns",
    "files.hierarchyColumnsConfigured": "Permission columns set — edit",
    "files.hierarchyColumnsSetPrompt": "Set rep / supervisor column (for permissions and the team performance screen)…",
    "files.noHeadersDetected": "No columns have been detected for this file yet.",
    "files.hierarchyColumnsExplanation": "Choose the column whose value is the rep's/supervisor's platform email. That person will then only see rows where their email appears in this file. Leave it as \"None\" to keep the file visible to everyone. Setting the rep column here is also what makes the file appear on the team performance screen.",
    "files.repColumnLabel": "Rep column",
    "files.supervisorColumnLabel": "Supervisor column",
    "files.managerColumnLabel": "Manager column",
    "files.cancel": "Cancel",
    "files.save": "Save",
    "files.nonePlaceholder": "None",
    "files.noneOption": "— None —",
    "files.routeLinkSuccess": "Column linked to route",
    "files.saveError": "Failed to save",
    "files.routeUnlinkSuccess": "Route link removed",
    "files.cancelError": "Failed to cancel",
    "files.routeConfigured": "Rep column linked to Route — edit",
    "files.routeLinkPrompt": "Is column \"{column}\" a route code, not an email? Link it here…",
    "files.routeExplanation": "This means column \"{column}\" in this file doesn't directly contain the rep's email, but contains a route code instead. The rep/supervisor for each route is in the \"Routes\" file. If the route also contains the rep's code (not their email) like \"EMP001\", choose the \"Employees\" file below and specify the code column and email column — the system will look up that code and get the email automatically.",
    "files.routesFileLabel": "Routes file",
    "files.chooseFilePlaceholder": "Choose a file…",
    "files.routeIdColumnLabel": "Route code column in this file",
    "files.routeRepColumnLabel": "Rep code/email column in this file",
    "files.routeSupervisorColumnLabel": "Supervisor code/email column (optional)",
    "files.employeesFileLabel": "Employees file — optional, if the code in Routes isn't a direct email",
    "files.employeeIdColumnLabel": "Employee code column (EmployeeID)",
    "files.employeeEmailColumnLabel": "Employee email column",
    "files.employeeSupervisorEmailColumnLabel": "Supervisor's email column (fallback, if there's no direct supervisor column in Routes)",
    "files.unlinkButton": "Remove Link",
    "files.close": "Close",
    "files.rowCountChip": "{count} rows",
    "files.columnCountChip": "{count} columns",
    "files.periodChip": "{from} → {to}",
    "files.regionChip": "Region: {values}",
    "files.branchChip": "Branch: {values}",
    "files.salesRepChip": "Rep: {values}",
    "files.routeChip": "Route: {values}",
    "files.statusReady": "Ready",
    "files.statusFailed": "Failed",
    "files.statusProcessing": "Processing",
    "files.confirmTypeSuccess": "File type confirmed",
    "files.confirmTypeError": "Failed to confirm file type",
    "files.lowConfidenceNoGuess": "We couldn't confidently classify this file. What is it?",
    "files.lowConfidenceWithGuess": "We couldn't confidently classify this file (closest guess: {type}, {percent}% confidence). What is it?",
    "files.confidenceGuessPrefix": "We think this is",
    "files.confidenceGuessSuffix": "({percent}% confidence).",
    "files.confirm": "Confirm",
    "files.correct": "That's right",
    "files.updateSuccess": "File updated",
    "files.updateError": "Failed to update file",
    "files.mixedWorkbookExplanation": "This file appears to contain more than one dataset. Choose which sheet you want to use as",
    "files.unknownType": "unknown type",
    "files.sheetInfo": "— appears to be {type}{confidencePart} · {count} rows",
    "files.useThisSheet": "Use this sheet",
    "files.chooseTypePlaceholder": "Choose type…",
    "assistant.title": "Murshidak",
    "assistant.subtitle": "Ask about your customers, sales, and opportunities — get answers backed by real numbers from your own files.",
    "assistant.suggestion1": "Who are the top 10 customers whose sales dropped this month?",
    "assistant.suggestion2": "Analyze customer 12",
    "assistant.suggestion3": "I'm in Makkah tomorrow, prepare today's plan",
    "assistant.inputPlaceholder": "Ask about a customer, region, product, or today's plan...",
    "assistant.thinking": "Thinking...",
    "assistant.errorFallback": "Couldn't reach the assistant right now, please try again.",
    "heatmap.title": "Heat Map",
    "heatmap.subtitle":
      "Geographic density of sales, returns, collections, or customers. Set the filters once, then use the free-text box below to update them automatically.",
    "heatmap.settingsTitle": "Settings",
    "heatmap.scopeFieldLabel": "Scope field (optional — region/rep)",
    "heatmap.scopeFieldNone": "None (optional)",
    "heatmap.scopeValueLabel": "Scope value",
    "heatmap.scopeValueAll": "All",
    "heatmap.loading": "Loading…",
    "heatmap.metricLabel": "Metric",
    "heatmap.metricSales": "Sales density",
    "heatmap.metricReturns": "Returns density",
    "heatmap.metricCollection": "Collection density",
    "heatmap.metricLostSales": "Lost sales (specific product)",
    "heatmap.metricOpportunity": "Intervention opportunities (overall customer decline)",
    "heatmap.metricCustomerCount": "Customer density",
    "heatmap.scopeRoute": "Route",
    "heatmap.scopeCity": "City",
    "heatmap.scopeCustomerClass": "Customer class",
    "heatmap.scopeChannel": "Channel",
    "heatmap.categoryFilterDisable": "Remove category filter",
    "heatmap.categoryFilterEnable": "Filter by product category (Category Distribution)",
    "heatmap.categoryLabel": "Category",
    "heatmap.categoryPlaceholder": "Choose a category…",
    "heatmap.dateFromLabel": "From date (optional)",
    "heatmap.dateToLabel": "To date (optional)",
    "heatmap.lostSalesHint":
      'Compares two periods: products the customer bought in the first period ("before") but didn\'t repeat in the second ("recent") — their value is counted as a lost opportunity.',
    "heatmap.opportunityHint":
      'Compares each customer\'s total sales across two periods — if "recent" sales are lower than "before", the difference is counted as an intervention opportunity, not limited to a specific product.',
    "heatmap.priorWindowLabel": "First window (before — was buying)",
    "heatmap.recentWindowLabel": "Recent window",
    "heatmap.updateMapButton": "Update map",
    "heatmap.updatingButton": "Loading…",
    "heatmap.freeTextTitle": "Ask in plain language",
    "heatmap.freeTextPlaceholder": 'e.g. "Show me just the Riyadh region" or "Compare this month only"',
    "heatmap.applyButton": "Apply",
    "heatmap.freeTextHint": 'Translates your request into a filter (region/period/metric) on the settings above — review it, then click "Update map".',
    "heatmap.resultTitle": "Result",
    "heatmap.pointsBadge": "{count} points",
    "heatmap.metricBadge": "Metric: {metric}",
    "heatmap.totalBadge": "Total: {total}",
    "heatmap.excludedBadge": "{count} rows excluded (invalid coordinates)",
    "heatmap.generateDecisionsButton": "Generate AI decisions",
    "heatmap.pointsToastSuccess": "{count} points on the map",
    "heatmap.interpretWarningFallback": "Couldn't understand the request, try phrasing it differently.",
    "heatmap.interpretSuccessFallback": "Filter applied",
    "heatmap.interpretErrorFallback": "Couldn't understand the request",
    "heatmap.queryErrorFallback": "Couldn't load the map",
    "heatmap.decisionErrorFallback": "Couldn't generate decisions",
    "team.title": "Team",
    "team.subtitle": "Control who can access this workspace and what they can upload.",
    "team.tempPasswordTitle": "Temporary password for {email}",
    "team.tempPasswordNote": "This won't be shown again. Send it to the user — they'll be required to change it on first login.",
    "team.tempPasswordAck": "Got it, saved",
    "team.addUser": "Add user",
    "team.addUserDialogTitle": "Add a team member",
    "team.fullNameLabel": "Full name",
    "team.emailLabel": "Email",
    "team.roleLabel": "Role",
    "team.chooseRole": "Choose a role",
    "team.tempPasswordLabel": "Temporary password",
    "team.createUser": "Create user",
    "team.members": "Members",
    "team.loading": "Loading...",
    "team.nameHeader": "Name",
    "team.roleHeader": "Role",
    "team.branchHeader": "Branch",
    "team.statusHeader": "Status",
    "team.joinedHeader": "Joined",
    "team.noBranch": "No branch",
    "team.statusPending": "Pending",
    "team.statusActive": "Active",
    "team.statusInvited": "Invited",
    "team.statusSuspended": "Suspended",
    "team.statusLocked": "Locked",
    "team.statusDisabled": "Disabled",
    "team.statusArchived": "Archived",
    "team.disable": "Disable",
    "team.enable": "Enable",
    "team.resetPassword": "Reset password",
    "team.revokeSessions": "Revoke all sessions",
    "team.delete": "Delete user",
    "team.deleteConfirm": "Delete {email}? Their account will be locked, all sessions ended immediately, and they will disappear from this list.",
    "team.toastUserDeleted": "User deleted",
    "team.toastUserDeleteError": "Failed to delete user",
    "team.toastUserInvited": "User invited",
    "team.toastUserCreateError": "Could not create the user",
    "team.toastUserUpdateError": "Could not update the user",
    "team.toastBranchUpdateError": "Could not update the branch",
    "team.toastTempPasswordCreated": "Temporary password created",
    "team.toastPasswordResetError": "Could not reset the password",
    "team.toastSessionsRevoked": "All user sessions have been ended",
    "team.toastSessionsRevokeError": "Could not end the sessions",
    "sgi.title": "Grow Your Sales",
    "sgi.subtitle": "The top opportunities and risks that need a decision from you today.",
    "sgi.toastRecalculateSuccess": "Calculated — {count} situations ({highCount} high priority)",
    "sgi.toastRecalculateError": "Could not run the calculation",
    "sgi.toastRecalculateNowSuccess": "Updated — {count} situations ({highCount} high priority)",
    "sgi.toastRecalculateNowError": "Could not refresh",
    "sgi.setupCardTitleCustomPeriod": "Choose a custom period",
    "sgi.setupCardTitleFirstTime": "Setup — first time",
    "sgi.cancel": "Cancel",
    "sgi.targetMonthLabel": "Target month",
    "sgi.dateFromLabel": "From date (current period)",
    "sgi.dateToLabel": "To date (current period)",
    "sgi.priorDateFromLabel": "From date (prior period for comparison)",
    "sgi.priorDateToLabel": "To date (prior period for comparison)",
    "sgi.calculateNow": "Calculate now",
    "sgi.loadErrorMessage": "Could not load sales growth data. Try refreshing the page.",
    "sgi.emptyStateMessage": "No one at the company has run the sales growth calculation yet — ask your admin to click \"Calculate now\".",
    "sgi.lastUpdatedPrefix": "Last updated: {date}",
    "sgi.scopedToOwnTeamSuffix": " — limited to your team",
    "sgi.refreshNow": "Refresh now",
    "sgi.customPeriod": "Custom period",
    "sgi.monthlyGoalTitle": "Monthly Goal",
    "sgi.noTargetsMessage": "No targets set yet for {month} — sales achieved so far: {amount}.",
    "sgi.progressOf": "{actual} of {target}",
    "sgi.priorityCenterTitle": "Priority Center",
    "employees.title": "Employees",
    "employees.subtitle": "The company's official employee roster — completely separate from login accounts (users). An employee is an employment record, not a login account.",
    "employees.addEmployee": "Add employee",
    "employees.addEmployeeDialogTitle": "Add a new employee",
    "employees.employeeCodeLabel": "Employee code",
    "employees.fullNameLabel": "Full name",
    "employees.jobTitleLabel": "Job title",
    "employees.branchLabel": "Branch",
    "employees.noBranch": "No branch",
    "employees.managerLabel": "Direct manager",
    "employees.noManagerDialog": "No direct manager",
    "employees.contactEmailLabel": "Contact email",
    "employees.contactPhoneLabel": "Contact phone",
    "employees.addEmployeeSubmit": "Add employee",
    "employees.recordTitle": "Employee roster",
    "employees.recordDescription": "Branch and direct manager here are purely reference data — linking the employee to routes, targets, or customers is not part of this screen.",
    "employees.loading": "Loading...",
    "employees.empty": "No employees registered yet.",
    "employees.codeHeader": "Code",
    "employees.nameHeader": "Name",
    "employees.jobTitleHeader": "Job title",
    "employees.branchHeader": "Branch",
    "employees.managerHeader": "Direct manager",
    "employees.linkedAccountHeader": "Linked account",
    "employees.statusHeader": "Status",
    "employees.hireDateHeader": "Hire date",
    "employees.noManagerRow": "No manager",
    "employees.linked": "Linked",
    "employees.notLinked": "Not linked",
    "employees.editData": "Edit details",
    "employees.unlinkAccount": "Unlink user account",
    "employees.linkAccount": "Link to account: {email}",
    "employees.archive": "Archive",
    "employees.editDialogTitle": "Edit details for {name}",
    "employees.hireDateLabel": "Hire date",
    "employees.statusLabel": "Status",
    "employees.saveChanges": "Save changes",
    "employees.toastEmployeeCreated": "Employee added to the official roster",
    "employees.toastEmployeeCreateError": "Could not add the employee",
    "employees.toastEmployeeUpdated": "Employee details updated",
    "employees.toastEmployeeUpdateError": "Could not update the employee's details",
    "employees.toastEmployeeArchived": "Employee archived",
    "employees.toastEmployeeArchiveError": "Could not archive the employee",
    "employees.toastBranchUpdateError": "Could not update the branch",
    "employees.toastManagerUpdateError": "Could not update the direct manager",
    "employees.toastUserLinked": "Employee linked to the user account",
    "employees.toastLinkError": "Could not link the account",
    "employees.toastUnlinked": "Account unlinked",
    "employees.toastUnlinkError": "Could not unlink the account",
    "employees.statusDraft": "Draft",
    "employees.statusActive": "Active",
    "employees.statusOnLeave": "On leave",
    "employees.statusSuspended": "Suspended",
    "employees.statusInactive": "Inactive",
    "employees.statusArchived": "Archived",
    "settings.title": "Settings",
    "settings.subtitle": "Manage your company data, Custom GPT settings, and billing.",
    "settings.tabCompany": "Company",
    "settings.tabBranches": "Branches",
    "settings.tabDataSources": "Data Sources",
    "settings.tabPolicies": "Policies & Compliance",
    "settings.tabAccount": "Account",
    "settings.tabBilling": "Billing",
    "settings.loading": "Loading...",
    "settings.save": "Save",
    "settings.saveChanges": "Save Changes",
    "settings.cancel": "Cancel",
    "settings.edit": "Edit",
    "settings.define": "Define",
    "settings.add": "Add",
    "settings.archive": "Archive",
    "settings.delete": "Delete",
    "settings.activate": "Activate",
    "settings.suspend": "Suspend",
    "settings.statusHeader": "Status",
    "settings.nameHeader": "Name",
    "settings.statusActiveGeneric": "Active",
    "settings.statusArchivedGeneric": "Archived",
    "settings.companyDataTitle": "Company Data",
    "settings.companyNameLabel": "Company Name",
    "settings.companyUpdateSuccess": "Company data updated",
    "settings.companyUpdateError": "Failed to update company data",
    "settings.profileTitle": "Additional Details",
    "settings.profileDescription": "Country, city, time zone, currency, and the company's contact details.",
    "settings.countryLabel": "Country",
    "settings.cityLabel": "City",
    "settings.timeZoneLabel": "Time Zone",
    "settings.currencyLabel": "Currency",
    "settings.defaultLanguageLabel": "Default Language",
    "settings.fiscalYearStartLabel": "Fiscal Year Start",
    "settings.contactEmailLabel": "Contact Email",
    "settings.contactPhoneLabel": "Contact Phone",
    "settings.profileUpdateSuccess": "Additional company data updated",
    "settings.profileUpdateError": "Failed to update data",
    "settings.discoveryTitle": "Customer Discovery Provider",
    "settings.discoveryDescription":
      "Choose the service the \"Search around me\" button in the Visit Copilot uses to discover new customers nearby.",
    "settings.discoveryOsmLabel": "OpenStreetMap (default — free)",
    "settings.discoveryOsmDescription": "Completely free — no key or account needed.",
    "settings.discoveryGoogleLabel": "Google Places",
    "settings.discoveryGoogleDescription":
      "This service is not provided by the platform and the platform does not bear its cost — it uses your company's own billing account directly.",
    "settings.discoveryApiKeyLabel": "Google Places API Key",
    "settings.discoveryApiKeySavedPlaceholder": "•••• saved",
    "settings.discoveryApiKeyPlaceholder": "Enter the key here",
    "settings.discoveryClearKey": "Clear key",
    "settings.discoveryKeyRequiredHint": "Enter a Google Places API key first to be able to select Google Places.",
    "settings.discoveryUpdateSuccess": "Customer discovery settings updated",
    "settings.discoveryUpdateError": "Failed to update customer discovery settings",
    "settings.addBranchTitle": "Add New Branch",
    "settings.addBranchDescription":
      "A branch is the company's current organizational level. Additional levels (region, distribution center) will be supported in the future without any change here.",
    "settings.branchCodeLabel": "Branch Code",
    "settings.branchNameLabel": "Branch Name",
    "settings.currentBranchesTitle": "Current Branches",
    "settings.noBranchesYet": "No branches registered yet.",
    "settings.codeHeader": "Code",
    "settings.branchAddSuccess": "Branch added",
    "settings.branchAddError": "Failed to add branch",
    "settings.branchArchiveSuccess": "Branch archived",
    "settings.branchArchiveError": "Failed to archive branch",
    "settings.dsStatusDraft": "Draft",
    "settings.dsStatusConfiguring": "Configuring",
    "settings.dsStatusConnected": "Connected",
    "settings.dsStatusSuspended": "Suspended",
    "settings.healthHealthy": "Healthy",
    "settings.healthWarning": "Warning",
    "settings.healthError": "Error",
    "settings.healthOffline": "Offline",
    "settings.refreshQueued": "Queued",
    "settings.refreshRunning": "Running",
    "settings.refreshCompleted": "Completed",
    "settings.refreshFailed": "Failed",
    "settings.authNone": "No Authentication",
    "settings.authBasic": "Username & Password",
    "settings.authApiKey": "API Key",
    "settings.connHost": "Host",
    "settings.connPort": "Port",
    "settings.connDatabase": "Database",
    "settings.connBaseUrl": "Base API URL",
    "settings.connBucket": "Bucket Name",
    "settings.dataSourcesIntro":
      "Define and manage the company's data sources only (source name, type, connection details). Uploading files or refreshing the data itself isn't part of this screen — that will be handled later in the Refresh Center.",
    "settings.addDataSource": "Add Data Source",
    "settings.addDataSourceDialogTitle": "Add New Data Source",
    "settings.dsNameLabel": "Source Name",
    "settings.dsTypeLabel": "Source Type",
    "settings.dsTypePlaceholder": "Choose Type",
    "settings.dsDescriptionLabel": "Description",
    "settings.dsCategoryLabel": "File/Data Category",
    "settings.dsCategoryPlaceholder": "Customers, invoices, payments, ...",
    "settings.authMethodLabel": "Authentication Method",
    "settings.ownerLabel": "Owner",
    "settings.noOwner": "No Owner",
    "settings.connectionFieldsTitle": "Connection Details (optional — depends on type)",
    "settings.credentialsTitle": "Credentials (optional — stored encrypted and won't be shown again)",
    "settings.credUsernameLabel": "Username / Key",
    "settings.credSecretLabel": "Password / Secret",
    "settings.addDataSourceSubmit": "Add Source",
    "settings.registeredDataSourcesTitle": "Registered Data Sources",
    "settings.noDataSourcesYet": "No data sources registered yet.",
    "settings.typeHeader": "Type",
    "settings.categoryHeader": "Category",
    "settings.healthHeader": "Health",
    "settings.lastRefreshHeader": "Last Refresh",
    "settings.neverRefreshed": "Not refreshed yet",
    "settings.runRefreshNow": "Run Refresh Now",
    "settings.testConnection": "Test Connection",
    "settings.confirmDeleteDataSource": 'Are you sure you want to delete the data source "{name}"?',
    "settings.refreshHistoryTitle": "Refresh History",
    "settings.refreshHistoryDescription":
      "Every refresh run validates the company's organizational structure, then checks that files exist for each expected data category (Full Refresh only in this version) — it never creates or modifies any actual customer/invoice data.",
    "settings.noRefreshRunsYet": "No refresh runs yet.",
    "settings.sourceHeader": "Source",
    "settings.dataQualityHeader": "Data Quality Score",
    "settings.missingFilesHeader": "Missing Files",
    "settings.listSeparator": ", ",
    "settings.durationHeader": "Duration",
    "settings.runDateHeader": "Run Date",
    "settings.durationSeconds": "{value}s",
    "settings.dataSourceAddSuccess": "Data source added",
    "settings.dataSourceAddError": "Failed to add data source",
    "settings.dataSourceStatusUpdateError": "Failed to update status",
    "settings.dataSourceTestError": "Failed to test connection",
    "settings.refreshSuccessMessage": "Refresh completed — data quality score: {score}%",
    "settings.refreshFailureMessage": "Refresh failed — check the refresh history for details",
    "settings.refreshTriggerError": "Failed to trigger refresh",
    "settings.dataSourceDeleteSuccess": "Data source deleted",
    "settings.dataSourceDeleteError": "Failed to delete — the source must be suspended first if active",
    "settings.policyTypeOrganizational": "Organizational Policy",
    "settings.policyTypePassword": "Password Policy",
    "settings.policyTypeRefresh": "Refresh Policy",
    "settings.policyTypeEmployeeAssignment": "Employee Assignment Policy",
    "settings.policyTypePermission": "Permission Policy",
    "settings.policyTypeArchiving": "Archiving Policy",
    "settings.policySaveSuccess": "Policy saved",
    "settings.policySaveError": "Failed to save policy",
    "settings.invalidJson": "Invalid format — must be valid JSON",
    "settings.companyPoliciesTitle": "Company Policies",
    "settings.companyPoliciesDescription":
      "The official reference for company policies — interpreting and enforcing them remains the responsibility of the relevant engine. Editing the password policy here does not currently, automatically change the actual login validation rules, as noted in this phase's report.",
    "settings.policyHeader": "Policy",
    "settings.versionHeader": "Version",
    "settings.policyEnabled": "Enabled",
    "settings.policyDisabled": "Disabled",
    "settings.policyUndefined": "Undefined",
    "settings.policyContentDescription": "Policy content (JSON) — the shape is free-form since each policy type has different settings.",
    "settings.complianceOverviewTitle": "Compliance Overview",
    "settings.complianceOverviewDescription":
      "Only shows whether each policy is defined and enabled — deep verification of every user's/record's detailed compliance with the policy isn't available yet.",
    "settings.fullyCompliant": "Fully Compliant",
    "settings.hasUndefinedPolicies": "Some policies are undefined",
    "settings.compliant": "Compliant",
    "settings.nonCompliant": "Non-Compliant",
    "settings.changePasswordTitle": "Change Password",
    "settings.changePasswordDescription": "Changing your password automatically signs you out of any other signed-in device.",
    "settings.currentPasswordLabel": "Current Password",
    "settings.newPasswordLabel": "New Password",
    "settings.changePasswordSuccess": "Password changed. You'll be signed out of your other devices.",
    "settings.changePasswordError": "Failed to change password",
    "settings.gptSettingsTitle": "GPT Settings",
    "settings.gptSettingsDescription":
      "The name and API key used to authenticate the Action. The Custom GPT's link itself is set by the Super Admin at the platform level.",
    "settings.gptNameLabel": "GPT Name",
    "settings.apiKeyIdLabel": "API Key ID: {id}",
    "settings.regenerateApiKey": "Regenerate API Key",
    "settings.gptSaveSuccess": "Custom GPT settings saved",
    "settings.gptSaveError": "Failed to save settings",
    "settings.regenerateSuccess": "New API key generated",
    "settings.regenerateError": "Failed to generate key",
    "settings.saveApiKeyNowTitle": "Save This API Key Now",
    "settings.saveApiKeyNowDescription": "It won't be shown again. Paste it into the Action's authentication settings.",
    "settings.paymentSucceeded": "Succeeded",
    "settings.paymentFailed": "Failed",
    "settings.paymentPending": "Pending",
    "settings.subTrial": "Trial",
    "settings.subActive": "Active",
    "settings.subExpired": "Expired",
    "settings.subSuspended": "Suspended",
    "settings.currentPlanTitle": "Current Plan",
    "settings.pricePerMonth": "{price}/month",
    "settings.paymentHistoryTitle": "Payment History",
    "settings.noPaymentsYet": "No payments recorded yet.",
    "settings.dateHeader": "Date",
    "settings.amountHeader": "Amount",
    "customerComparison.title": "Customer Comparison",
    "customerComparison.subtitle":
      "Pick an existing customer and the system surfaces what their nearest geographic neighbors buy that they don't — a real, data-driven upsell opportunity.",
    "customerComparison.settingsTitle": "Settings",
    "customerComparison.targetCustomerLabel": "Customer to compare",
    "customerComparison.searchPlaceholder": "Search by name or code…",
    "customerComparison.customersLoadError": "Failed to load the customer list",
    "customerComparison.noResults": "No results",
    "customerComparison.nearestCountLabel": "Number of nearest neighbors to compare",
    "customerComparison.compareButton": "Compare",
    "customerComparison.compareSuccessToast": "Comparison complete — {gapCount} missing products from {neighborCount} neighbors",
    "customerComparison.compareErrorFallback": "Failed to complete the comparison",
    "customerComparison.talkingPointsErrorFallback": "Failed to generate talking points",
    "customerComparison.resultTitle": "Result",
    "customerComparison.targetCustomerBadge": "Customer: {name}",
    "customerComparison.neighborsBadge": "{count} neighbors",
    "customerComparison.targetProductCountBadge": "{count} products already bought by this customer",
    "customerComparison.gapProductsBadge": "{count} missing products (upsell opportunity)",
    "customerComparison.excludedBadge": "{count} customers excluded (invalid coordinates)",
    "customerComparison.mapTitle": "Customer and neighbors on the map",
    "customerComparison.mapCenterLabel": "Target customer",
    "customerComparison.mapNeighborLabel": "Neighbor (nearest customer)",
    "customerComparison.gapTableTitle": "Products the neighbors buy that this customer doesn't have",
    "customerComparison.noGapMessage": "No gap — this customer buys almost everything their neighbors buy.",
    "customerComparison.colProduct": "Product",
    "customerComparison.colCategory": "Category",
    "customerComparison.colTotalQty": "Total quantity among neighbors",
    "customerComparison.colTotalValue": "Total value among neighbors",
    "customerComparison.colCustomerCount": "Number of buying neighbors",
    "customerComparison.talkingPointsTitle": "Upsell talking points (optional)",
    "customerComparison.talkingPointsDescription":
      "AI analyzes the gap table above and writes the rep a short summary plus practical talking points to convince the customer to try the products their neighbors buy that they haven't tried.",
    "customerComparison.generateTalkingPointsButton": "Generate talking points with AI",
    "analysisStudio.__reserved": "",
    "customerLocations.__reserved": "",
    "newCustomer.__reserved": "",
    "routePlanning.__reserved": "",
    "visitEfficiency.__reserved": "",
    "teamPerformance.title": "Team Performance",
    "teamPerformance.descriptionSupervisor": "Your reps' sales, collection, and returns for the period you choose.",
    "teamPerformance.descriptionManager": "The team's sales, collection, and returns, grouped under each supervisor.",
    "teamPerformance.repCount": "{count} reps",
    "teamPerformance.loadError": "Could not load team performance",
    "teamPerformance.settingsTitle": "Settings",
    "teamPerformance.dateFromLabel": "From date",
    "teamPerformance.dateToLabel": "To date",
    "teamPerformance.compareEnableButton": "Compare with a prior period (to show trend)",
    "teamPerformance.compareDisableButton": "Clear prior-period comparison",
    "teamPerformance.priorDateFromLabel": "From date (comparison period)",
    "teamPerformance.priorDateToLabel": "To date (comparison period)",
    "teamPerformance.showPerformanceButton": "Show performance",
    "teamPerformance.exportExcelButton": "Export Excel",
    "teamPerformance.categorySales": "Sales",
    "teamPerformance.categoryCollection": "Collection",
    "teamPerformance.categoryReturns": "Returns",
    "teamPerformance.categoryUnavailableBadge": "{category} data unavailable",
    "teamPerformance.flatViewTitle": "Your team",
    "teamPerformance.treeViewTitle": "Team by supervisor",
    "teamPerformance.emptyReps": "No reps matched these filters.",
    "teamPerformance.noSupervisor": "No supervisor assigned",
    "teamPerformance.salesValue": "Sales: {value}",
    "teamPerformance.salesEmpty": "Sales: —",
    "teamPerformance.salesUnavailable": "Sales: unavailable",
    "teamPerformance.collectionValue": "Collection: {value}",
    "teamPerformance.collectionUnavailable": "Collection: unavailable",
    "teamPerformance.returnsValue": "Returns: {value}",
    "teamPerformance.returnsUnavailable": "Returns: unavailable",
    "teamPerformance.coachButton": "Coach",
    "teamPerformance.coachError": "Could not generate coaching",
    "teamPerformance.colRep": "Rep",
    "teamPerformance.colEmail": "Email",
    "teamPerformance.colSupervisor": "Supervisor",
    "teamPerformance.colSales": "Sales",
    "teamPerformance.colSalesPrior": "Sales (prior period)",
    "teamPerformance.colSalesChangePct": "Sales change %",
    "teamPerformance.colCollection": "Collection",
    "teamPerformance.colCollectionRatePct": "Collection rate of sales %",
    "teamPerformance.colReturns": "Returns",
    "teamPerformance.colReturnRatePct": "Return rate of sales %",
    "teamPerformance.notAvailable": "Not available",
    "teamPerformance.sheetName": "Team Performance",
    "teamPerformance.fileName": "team-performance.xlsx",
    "copilot.title": "Visit Copilot",
    "copilot.subtitle": "Your day plan and visits — everything you need before walking in.",
    "copilot.periodLabel": "Period",
    "copilot.period1m": "Last month",
    "copilot.period3m": "Last 3 months",
    "copilot.period6m": "Last 6 months",
    "copilot.period12m": "Last 12 months",
    "copilot.periodCustom": "Custom period",
    "copilot.fromLabel": "From date",
    "copilot.toLabel": "To date",
    "copilot.customPeriodHint": "Pick a start and end date first.",
    "copilot.vanStockLabel": "Consider van stock",
    "copilot.notWorkingDay": "Today is not a scheduled working day — this plan is indicative.",
    "copilot.visitsLabel": "Today's visits",
    "copilot.dailyTargetLabel": "Daily target",
    "copilot.noTarget": "No target set",
    "copilot.expectedSalesLabel": "Expected sales",
    "copilot.distanceLabel": "Est. distance",
    "copilot.durationLabel": "Est. time",
    "copilot.kmValue": "{value} km",
    "copilot.minValue": "{value} min",
    "copilot.planRoute": "Geographic order (shortest distance)",
    "copilot.planPriority": "Sales priority (highest impact)",
    "copilot.briefLoadError": "Could not load today's brief",
    "copilot.planError": "Could not build the plan",
    "copilot.customersTitle": "Today's customers",
    "copilot.noCustomers": "No customers on today's route.",
    "copilot.avgOrder": "Avg order: {value}",
    "copilot.back": "Back to list",
    "copilot.salesLabel": "Sales",
    "copilot.invoiceCount": "{count} invoices",
    "copilot.returnsLabel": "Returns",
    "copilot.returnRate": "{value}% of sales",
    "copilot.pendingLabel": "Pending collection",
    "copilot.trendLabel": "Trend",
    "copilot.topProductsTitle": "Top products",
    "copilot.actionsTitle": "Visit checklist",
    "copilot.briefingLoadError": "Could not load the customer briefing",
    "copilot.chatTitle": "Ask Murshidak about this customer",
    "copilot.chatPlaceholder": "Ask anything about this customer…",
    "copilot.chatError": "Something went wrong, try again",
    "copilot.thinking": "Thinking…",
    "copilot.discoverButton": "Discover new opportunities",
    "copilot.discoveryTitle": "Discover new customers",
    "copilot.discoveryLoadError": "Could not load discovery opportunities",
    "copilot.mapLoading": "Loading the map…",
    "copilot.googleSearchButton": "Search around me",
    "copilot.googleSearchResult": "Found {found}, {newCount} of them new",
    "copilot.googleSearchDisabled": "Nearby search is not available right now",
    "copilot.geoFallbackNotice": "Couldn't get your location — searching around your route's customers",
    "copilot.geoUnavailable": "No location to search around right now",
    "copilot.legendExisting": "Existing customer",
    "copilot.legendNew": "New prospect",
    "copilot.legendVisited": "Visited",
    "copilot.legendIgnored": "Ignored",
    "copilot.legendConverted": "Converted",
    "copilot.popupScore": "Priority: {value}",
    "copilot.popupExpected": "Expected value: {value}",
    "copilot.popupProbability": "Success probability: {value}%",
    "copilot.popupDistance": "Distance: {value} km",
    "copilot.startVisit": "Start visit",
    "copilot.ignore": "Ignore",
    "copilot.ignoredToast": "Prospect ignored",
    "copilot.statusError": "Could not update the prospect status",
    "copilot.oppFound": "Found within today's route range: {high} high opportunities, {medium} medium",
    "copilot.oppBest": "Adding the best two: +{value} SAR expected, +{minutes} min, +{km} km",
    "copilot.oppShowMap": "Show opportunities on the map",
    "copilot.prospectBadge": "Prospect",
    "copilot.markVisited": "Mark as visited",
    "copilot.markedVisited": "Marked as visited",
  },
};
