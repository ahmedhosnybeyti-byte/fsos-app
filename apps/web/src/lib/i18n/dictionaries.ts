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
type NewCustomerTranslationKey = "title" | "subtitle" | "pointTab" | "territoryTab" | "gpsUnsupported" | "locationFound" | "locationError" | "invalidCoordinates" | "analysisComplete" | "analysisError" | "talkingPointsError" | "stepLocation" | "stepCustomers" | "step1Title" | "gpsTab" | "mapTab" | "manualTab" | "useCurrentLocation" | "mapHint" | "latitude" | "longitude" | "useCoordinates" | "selectedLocation" | "nextCustomers" | "step2Title" | "backToLocation" | "referenceMethod" | "automatic" | "manual" | "both" | "nearestCustomers" | "automaticNearestCustomers" | "runAnalysis" | "result" | "referenceCustomers" | "products" | "excludedInvalidCoordinates" | "referenceCustomersMap" | "topProductAssortment" | "product" | "category" | "totalQuantity" | "totalValue" | "customerCount" | "talkingPointsTitle" | "talkingPointsHint" | "areaLabel" | "areaPlaceholder" | "generateTalkingPoints" | "expansionComplete" | "expansionError" | "territoryTitle" | "territoryHint" | "scopeField" | "noneOptional" | "scopeValue" | "loading" | "all" | "gridSize" | "runScan" | "candidateAreas" | "searchCustomers" | "noResults" | "selectedCustomers" | "scopeRoute" | "scopeCity" | "scopeCustomerClass" | "scopeChannel" | "km";

export const LOCALES: Locale[] = ["ar", "en"];

export type TranslationKey =
  | `newCustomer.${NewCustomerTranslationKey}`
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
  | "nav.reports"
  | "nav.sgi"
  | "nav.territoryIntelligence"
  | "nav.decisionAnalyticsStudio"
  | "nav.geoEngine"
  | "nav.fsos360"
  | "nav.visitCopilot"
  | "nav.team"
  | "nav.employees"
  | "nav.settings"
  | "nav.account"
  | "admin.nav.dashboard"
  | "admin.nav.users"
  | "admin.nav.companies"
  | "admin.nav.subscriptions"
  | "admin.nav.payments"
  | "admin.nav.accessControl"
  | "admin.nav.usage"
  | "admin.nav.settings"
  | "account.title"
  | "account.subtitle"
  | "account.profileTitle"
  | "account.name"
  | "account.email"
  | "account.role"
  | "account.company"
  | "account.companyUnavailable"
  | "account.noCompany"
  | "account.passwordTitle"
  | "account.passwordDescription"
  | "account.currentPassword"
  | "account.newPassword"
  | "account.confirmNewPassword"
  | "account.showPassword"
  | "account.hidePassword"
  | "account.currentPasswordRequired"
  | "account.passwordRequirements"
  | "account.passwordMismatch"
  | "account.passwordReuseError"
  | "account.currentPasswordIncorrect"
  | "account.passwordChangeSuccess"
  | "account.passwordChangeError"
  | "account.changePassword"
  | "account.loggingOut"
  | "account.emailTitle"
  | "account.emailDescription"
  | "account.newEmail"
  | "account.confirmEmail"
  | "account.emailMismatch"
  | "account.changeEmail"
  | "account.emailChangeSuccess"
  | "account.emailChangeError"
  | "territoryIntelligence.title"
  | "territoryIntelligence.subtitle"
  | "territoryIntelligence.libraryTitle"
  | "territoryIntelligence.categoryPerformance"
  | "territoryIntelligence.categoryRisk"
  | "territoryIntelligence.categoryOpportunity"
  | "territoryIntelligence.categoryTerritory"
  | "territoryIntelligence.metricHealthScore"
  | "territoryIntelligence.metricSalesGrowth"
  | "territoryIntelligence.metricActiveCustomerRate"
  | "territoryIntelligence.metricLostSales"
  | "territoryIntelligence.metricVisitCoverage"
  | "territoryIntelligence.metricCollectionHealth"
  | "territoryIntelligence.metricOpportunityValue"
  | "territoryIntelligence.tierExcellent"
  | "territoryIntelligence.tierGood"
  | "territoryIntelligence.tierAverage"
  | "territoryIntelligence.tierWeak"
  | "territoryIntelligence.tierVeryWeak"
  | "territoryIntelligence.panelSummaryTab"
  | "territoryIntelligence.panelPerformanceTab"
  | "territoryIntelligence.panelRiskTab"
  | "territoryIntelligence.panelOpportunityTab"
  | "territoryIntelligence.panelComparisonTab"
  | "territoryIntelligence.panelWhyTitle"
  | "territoryIntelligence.panelRecommendationTitle"
  | "territoryIntelligence.panelSuggestedActionsTitle"
  | "territoryIntelligence.panelExpectedImpactTitle"
  | "territoryIntelligence.panelCtaCreateVisitPlan"
  | "territoryIntelligence.panelClose"
  | "territoryIntelligence.rankingTitle"
  | "territoryIntelligence.rankingCustomersBadge"
  | "territoryIntelligence.emptyState"
  | "territoryIntelligence.loading"
  | "territoryIntelligence.errorLoad"
  | "territoryIntelligence.executiveModeToggle"
  | "territoryIntelligence.executiveTopOpportunities"
  | "territoryIntelligence.executiveWorstTerritories"
  | "territoryIntelligence.executiveFastestWin"
  | "territoryIntelligence.executiveBiggestRisk"
  | "territoryIntelligence.executiveViewMap"
  | "territoryIntelligence.quickToolsTitle"
  | "territoryIntelligence.exportPpt"
  | "territoryIntelligence.exportImage"
  | "territoryIntelligence.selectTerritoryHint"
  | "territoryIntelligence.comparisonPickSecond"
  | "territoryIntelligence.comparisonTitle"
  | "territoryIntelligence.noWhyItems"
  | "territoryIntelligence.breadcrumbRoot"
  | "territoryIntelligence.levelCity"
  | "territoryIntelligence.levelCustomer"
  | "territoryIntelligence.goUp"
  | "territoryIntelligence.drillIntoHint"
  | "territoryIntelligence.metricRiskLevel"
  | "territoryIntelligence.riskHigh"
  | "territoryIntelligence.riskMedium"
  | "territoryIntelligence.riskLow"
  | "territoryIntelligence.panelLastUpdated"
  | "territoryIntelligence.panelRanking"
  | "territoryIntelligence.panelRankingValue"
  | "territoryIntelligence.panelVsLastMonth"
  | "territoryIntelligence.panelAiInsightTitle"
  | "territoryIntelligence.panelGrowthOpportunitiesTitle"
  | "territoryIntelligence.panelVisitPlanTitle"
  | "territoryIntelligence.panelVisitPlanHint"
  | "territoryIntelligence.panelCompareBtn"
  | "territoryIntelligence.panelExportBtn"
  | "territoryIntelligence.panelShareBtn"
  | "territoryIntelligence.customerLevelTitle"
  | "territoryIntelligence.customerLevelHint"
  | "territoryIntelligence.customerLevelEmpty"
  | "territoryIntelligence.customerSalesLabel"
  | "territoryIntelligence.boundarySourcePlaceholder"
  | "territoryIntelligence.layersPanelTitle"
  | "territoryIntelligence.layerActiveBadge"
  | "territoryIntelligence.displayModeHeat"
  | "territoryIntelligence.displayModeCluster"
  | "territoryIntelligence.displayModePoints"
  | "territoryIntelligence.displayModeSectionTitle"
  | "territoryIntelligence.invalidCoordinatesNotice"
  | "territoryIntelligence.coLocatedCustomers"
  | "territoryIntelligence.metricNoData"
  | "territoryIntelligence.customersCountSuffix"
  | "territoryIntelligence.aggregationSum"
  | "territoryIntelligence.aggregationAverage"
  | "territoryIntelligence.legendLow"
  | "territoryIntelligence.legendHigh"
  | "territoryIntelligence.exportCsv"
  | "territoryIntelligence.exportSuccess"
  | "territoryIntelligence.exportError"
  | "territoryIntelligence.exporting"
  | "territoryIntelligence.exportTotalCustomers"
  | "territoryIntelligence.exportUniqueLocations"
  | "territoryIntelligence.exportExcludedCoordinates"
  | "territoryIntelligence.exportScopeAll"
  | "territoryIntelligence.metricSectionTitle"
  | "territoryIntelligence.returnToDecisionStudio"
  | "decisionAnalyticsStudio.title"
  | "decisionAnalyticsStudio.subtitle"
  | "decisionAnalyticsStudio.resetFilters"
  | "decisionAnalyticsStudio.openTerritoryIntelligence"
  | "decisionAnalyticsStudio.dateRangeSeparator"
  | "decisionAnalyticsStudio.activeFiltersCount"
  | "decisionAnalyticsStudio.loading"
  | "decisionAnalyticsStudio.permissionDenied"
  | "decisionAnalyticsStudio.errorLoad"
  | "decisionAnalyticsStudio.noData"
  | "decisionAnalyticsStudio.emptyResult"
  | "decisionAnalyticsStudio.filterBranch"
  | "decisionAnalyticsStudio.filterTerritory"
  | "decisionAnalyticsStudio.filterChannel"
  | "decisionAnalyticsStudio.filterCategory"
  | "decisionAnalyticsStudio.filterBrand"
  | "decisionAnalyticsStudio.filterProduct"
  | "decisionAnalyticsStudio.filterCustomer"
  | "decisionAnalyticsStudio.filterRepresentative"
  | "decisionAnalyticsStudio.filterSupervisor"
  | "decisionAnalyticsStudio.kpiSales"
  | "decisionAnalyticsStudio.kpiGrowth"
  | "decisionAnalyticsStudio.kpiCoverage"
  | "decisionAnalyticsStudio.kpiOrders"
  | "decisionAnalyticsStudio.kpiCollections"
  | "decisionAnalyticsStudio.kpiStrikeRate"
  | "decisionAnalyticsStudio.kpiActiveCustomers"
  | "decisionAnalyticsStudio.kpiLostSales"
  | "decisionAnalyticsStudio.kpiAverageOrder"
  | "decisionAnalyticsStudio.kpiProductivity"
  | "decisionAnalyticsStudio.dimTerritory"
  | "decisionAnalyticsStudio.dimChannel"
  | "decisionAnalyticsStudio.dimCategory"
  | "decisionAnalyticsStudio.dimBrand"
  | "decisionAnalyticsStudio.dimProduct"
  | "decisionAnalyticsStudio.dimCustomer"
  | "decisionAnalyticsStudio.dimRepresentative"
  | "decisionAnalyticsStudio.dimSupervisor"
  | "decisionAnalyticsStudio.drillHint"
  | "decisionAnalyticsStudio.chartColumn"
  | "decisionAnalyticsStudio.chartBar"
  | "decisionAnalyticsStudio.chartLine"
  | "decisionAnalyticsStudio.chartArea"
  | "decisionAnalyticsStudio.chartStacked"
  | "decisionAnalyticsStudio.chartPie"
  | "decisionAnalyticsStudio.chartTreemap"
  | "decisionAnalyticsStudio.chartScatter"
  | "decisionAnalyticsStudio.chartPareto"
  | "decisionAnalyticsStudio.chartTable"
  | "decisionAnalyticsStudio.otherSlice"
  | "decisionAnalyticsStudio.tooltipTarget"
  | "decisionAnalyticsStudio.tooltipAchievement"
  | "decisionAnalyticsStudio.tableColLabel"
  | "decisionAnalyticsStudio.aiInsightTitle"
  | "decisionAnalyticsStudio.aiInsightEmpty"
  | "decisionAnalyticsStudio.severityHigh"
  | "decisionAnalyticsStudio.severityMedium"
  | "decisionAnalyticsStudio.severityLow"
  | "decisionAnalyticsStudio.detailTableTitle"
  | "decisionAnalyticsStudio.detailTableCount"
  | "decisionAnalyticsStudio.colInvoice"
  | "decisionAnalyticsStudio.colDate"
  | "decisionAnalyticsStudio.colCustomer"
  | "decisionAnalyticsStudio.colProduct"
  | "decisionAnalyticsStudio.pageOf"
  | "geoEngine.title"
  | "geoEngine.subtitle"
  | "geoEngine.phase1Notice"
  | "geoEngine.phase2Notice"
  | "geoEngine.phase3Notice"
  | "geoEngine.modeLabel"
  | "geoEngine.modeHeat"
  | "geoEngine.modeBubble"
  | "geoEngine.modeCluster"
  | "geoEngine.modeTerritory"
  | "geoEngine.dateFromLabel"
  | "geoEngine.dateToLabel"
  | "geoEngine.kpiLabel"
  | "geoEngine.groupByLabel"
  | "geoEngine.groupByCustomer"
  | "geoEngine.groupByCity"
  | "geoEngine.kpiSales"
  | "geoEngine.kpiOrders"
  | "geoEngine.kpiCustomers"
  | "geoEngine.kpiVisits"
  | "geoEngine.kpiCollections"
  | "geoEngine.kpiReturns"
  | "geoEngine.kpiLostSales"
  | "geoEngine.filterBranch"
  | "geoEngine.filterCity"
  | "geoEngine.filterChannel"
  | "geoEngine.filterCategory"
  | "geoEngine.filterBrand"
  | "geoEngine.filterProduct"
  | "geoEngine.filterCustomer"
  | "geoEngine.filterRepresentative"
  | "geoEngine.filterSupervisor"
  | "geoEngine.updateButton"
  | "geoEngine.updatingButton"
  | "geoEngine.loading"
  | "geoEngine.errorLoad"
  | "geoEngine.emptyResult"
  | "geoEngine.pointsBadge"
  | "geoEngine.totalBadge"
  | "geoEngine.excludedBadge"
  | "geoEngine.chartTitle"
  | "geoEngine.kpiCardTotal"
  | "geoEngine.kpiCardMax"
  | "geoEngine.kpiCardPoints"
  | "geoEngine.kpiCardExcluded"
  | "geoEngine.executiveReset"
  | "geoEngine.executiveFullscreen"
  | "geoEngine.executiveExitFullscreen"
  | "geoEngine.executiveExportImage"
  | "geoEngine.executiveExportPdf"
  | "geoEngine.executiveExportError"
  | "shell.brand"
  | "shell.tagline"
  | "shell.logout"
  | "shell.more"
  | "shell.searchPlaceholder"
  | "group.data"
  | "group.aiInsights"
  | "group.customersTerritory"
  | "group.team"
  | "group.system"
  | "language.switchTo"
  | "shared.error.requestFailed"
  | "shared.error.unauthorized"
  | "shared.error.forbidden"
  | "shared.error.notFound"
  | "shared.error.conflict"
  | "shared.validation.invalid"
  | "shared.toast.copied"
  | "shared.tempPassword.title"
  | "shared.tempPassword.description"
  | "shared.action.copy"
  | "shared.action.dismiss"
  | "admin.nav.userActivity"
  | "performance.title" | "performance.subtitle" | "performance.loadError" | "performance.sellingDays" | "performance.previousMonth" | "performance.previousQuarter" | "performance.growthTitle" | "performance.comparisonDays" | "performance.againstPreviousMonth" | "performance.againstPreviousQuarter" | "performance.sales" | "performance.collections" | "performance.invoices" | "performance.customers" | "performance.skus" | "performance.returns" | "performance.noChange" | "performance.referencePeriod" | "performance.quarterAverage" | "performance.primaryTargets" | "performance.secondaryTargets" | "performance.monthlyTarget" | "performance.actual" | "performance.targetToDate" | "performance.difference" | "performance.achievement" | "performance.remaining" | "performance.requiredDaily" | "performance.forecast" | "performance.ahead" | "performance.nearPlan" | "performance.behind" | "performance.unavailable"
  | "subscription.title" | "subscription.plan" | "subscription.paymentStatus" | "subscription.paid" | "subscription.unpaid" | "subscription.trialEnds" | "subscription.blocked"
  | "performance.targetSales" | "performance.targetCollections" | "performance.targetWeight" | "performance.targetActiveCustomers" | "performance.targetProductiveCalls" | "performance.targetSkuDistribution"
  | "dashboard.refresh"
  | "analysisStudio.title" | "analysisStudio.subtitle" | "analysisStudio.clear" | "analysisStudio.unavailable" | "analysisStudio.empty"
  | "visitCopilotPreview.preview" | "visitCopilotPreview.title" | "visitCopilotPreview.subtitle" | "visitCopilotPreview.period" | "visitCopilotPreview.period1m" | "visitCopilotPreview.period3m" | "visitCopilotPreview.period6m" | "visitCopilotPreview.period12m" | "visitCopilotPreview.periodCustom" | "visitCopilotPreview.from" | "visitCopilotPreview.to" | "visitCopilotPreview.vanStock" | "visitCopilotPreview.customDateRequired" | "visitCopilotPreview.mode1" | "visitCopilotPreview.mode2" | "visitCopilotPreview.todayPlan" | "visitCopilotPreview.selectCustomer" | "visitCopilotPreview.noVisits" | "visitCopilotPreview.visitMode" | "visitCopilotPreview.mission" | "visitCopilotPreview.priority" | "visitCopilotPreview.missionNote" | "visitCopilotPreview.recommendations" | "visitCopilotPreview.geoIntelligence" | "visitCopilotPreview.previewData" | "visitCopilotPreview.geoDescription" | "visitCopilotPreview.askAi"
  | "routePlanning.title" | "routePlanning.subtitle" | "routePlanning.settings" | "routePlanning.scopeField" | "routePlanning.selectField" | "routePlanning.groupCount" | "routePlanning.groupCountHint" | "routePlanning.restoreAuto" | "routePlanning.splitting" | "routePlanning.splitNow" | "routePlanning.scopeValues" | "routePlanning.selectAll" | "routePlanning.clearAll" | "routePlanning.chooseScopeFirst" | "routePlanning.loading" | "routePlanning.noValues" | "routePlanning.result" | "routePlanning.before" | "routePlanning.after" | "routePlanning.showPerformance" | "routePlanning.export" | "routePlanning.routeName" | "routePlanning.customers" | "routePlanning.sales" | "routePlanning.averageCustomer" | "routePlanning.deviation" | "routePlanning.performance" | "routePlanning.good" | "routePlanning.average" | "routePlanning.weak" | "routePlanning.scopeRoute" | "routePlanning.scopeCity" | "routePlanning.scopeCustomerClass" | "routePlanning.scopeChannel" | "routePlanning.group"
  | "routePlanning.splitComplete" | "routePlanning.customersAcross" | "routePlanning.groups" | "routePlanning.splitError" | "routePlanning.selectedValues" | "routePlanning.customersUsed" | "routePlanning.coverage" | "routePlanning.targetAverage" | "routePlanning.maxDeviation" | "routePlanning.invalidCoordinates" | "routePlanning.newRoute" | "routePlanning.groupPrefix"
  | "routePlanning.exportCustomerId" | "routePlanning.exportName" | "routePlanning.exportLatitude" | "routePlanning.exportLongitude" | "routePlanning.exportBeforeRoute" | "routePlanning.exportAfterRoute" | "routePlanning.exportSheet" | "routePlanning.exportFilePrefix"
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
  | "files.employeeExportsTitle"
  | "files.employeeExportsSubtitle"
  | "files.employeeExportsEmpty"
  | "files.exportRangeAll"
  | "files.exportRangeLast1Month"
  | "files.exportRangeLast3Months"
  | "files.exportRangeLast6Months"
  | "files.exportRangeLast12Months"
  | "files.exportRangeFrom"
  | "files.exportRangeTo"
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
  | "files.batchSkipped"
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
  | "assistant.adviceLabel"
  | "assistant.decisionLabel"
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
  | "heatmap.layersEnable"
  | "heatmap.layersDisable"
  | "heatmap.layerDimensionLabel"
  | "heatmap.layersHint"
  | "heatmap.layersBadge"
  | "heatmap.exportExcelButton"
  | "heatmap.sheetName"
  | "heatmap.fileName"
  | "heatmap.colLayer"
  | "heatmap.colLabel"
  | "heatmap.colMetric"
  | "heatmap.colValue"
  | "heatmap.colLat"
  | "heatmap.colLon"
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
  | "sgi.performanceKpis"
  | "sgi.actualSales"
  | "sgi.activeCustomers"
  | "sgi.kpiLoading"
  | "sgi.kpiNoRepStats"
  | "sgi.kpiMissingCurrentUserEmail"
  | "sgi.kpiEmptyTeam"
  | "sgi.exportPdf"
  | "sgi.exportPdfPending"
  | "sgi.exportPdfError"
  | "sgi.pdfReportTitle"
  | "sgi.pdfGeneratedAtLabel"
  | "sgi.pdfExecutiveSummaryTitle"
  | "sgi.pdfTotalOpportunitiesLabel"
  | "sgi.pdfHighSeverityLabel"
  | "sgi.pdfTargetAchievementTitle"
  | "sgi.pdfTargetAchievedOf"
  | "sgi.pdfNoTargetNote"
  | "sgi.pdfTopByCategoryTitle"
  | "sgi.pdfDeferredTitle"
  | "sgi.pdfDeferredNote"
  | "sgi.pdfFullListTitle"
  | "sgi.pdfNoOwnerLabel"
  | "employees.title"
  | "employees.subtitle"
  | "employees.addEmployee"
  | "employees.resyncFromUpload"
  | "employees.resyncSuccess"
  | "employees.resyncNoDataset"
  | "employees.resyncError"
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
  | "employees.exportData"
  | "employees.toastExportError"
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
  | "visitEfficiency.title"
  | "visitEfficiency.subtitle"
  | "visitEfficiency.settings"
  | "visitEfficiency.scopeField"
  | "visitEfficiency.scopeRoute"
  | "visitEfficiency.scopeCity"
  | "visitEfficiency.scopeCustomerClass"
  | "visitEfficiency.scopeChannel"
  | "visitEfficiency.noFilter"
  | "visitEfficiency.scopeValues"
  | "visitEfficiency.selectAll"
  | "visitEfficiency.clearAll"
  | "visitEfficiency.loading"
  | "visitEfficiency.noScopeValues"
  | "visitEfficiency.selectedValues"
  | "visitEfficiency.fromDate"
  | "visitEfficiency.toDate"
  | "visitEfficiency.analyze"
  | "visitEfficiency.analyzing"
  | "visitEfficiency.analysisComplete"
  | "visitEfficiency.analysisError"
  | "visitEfficiency.result"
  | "visitEfficiency.visits"
  | "visitEfficiency.excludedSingleVisitDays"
  | "visitEfficiency.excludedNoCoordinates"
  | "visitEfficiency.rowOrder"
  | "visitEfficiency.exportExcel"
  | "visitEfficiency.noMapPoints"
  | "visitEfficiency.noMapPointsHint"
  | "visitEfficiency.visibleReps"
  | "visitEfficiency.all"
  | "visitEfficiency.selectedOf"
  | "visitEfficiency.rep"
  | "visitEfficiency.visitDays"
  | "visitEfficiency.visitCount"
  | "visitEfficiency.totalDistance"
  | "visitEfficiency.avgDistance"
  | "visitEfficiency.noRepVisits"
  | "visitEfficiency.date"
  | "visitEfficiency.customer"
  | "visitEfficiency.distanceFromPrevious"
  | "visitEfficiency.total"
  | "visitEfficiency.exportSummarySheet"
  | "visitEfficiency.exportDetailsSheet"
  | "visitEfficiency.exportFileName"
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
  | "teamPerformance.exportExecutiveButton"
  | "teamPerformance.exportExecutiveSuccess"
  | "teamPerformance.exportExecutiveError"
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
  | "teamPerformance.supervisor"
  | "teamPerformance.allSupervisors"
  | "teamPerformance.salesRep"
  | "teamPerformance.allSalesReps"
  | "teamPerformance.comparisonFrom"
  | "teamPerformance.comparisonTo"
  | "teamPerformance.clearComparison"
  | "teamPerformance.focusMode"
  | "teamPerformance.compareMode"
  | "teamPerformance.showAdditionalTargets"
  | "teamPerformance.hideAdditionalTargets"
  | "teamPerformance.compareGrowth"
  | "teamPerformance.compareTargets"
  | "teamPerformance.compareAdditionalTargets"
  | "teamPerformance.selectEntities"
  | "teamPerformance.salesAchievement"
  | "teamPerformance.diagnosis"
  | "teamPerformance.close"
  | "teamPerformance.targetInsight"
  | "teamPerformance.diagnosisSummaryPositive"
  | "teamPerformance.diagnosisSummaryNegative"
  | "teamPerformance.diagnosisEvidence"
  | "teamPerformance.diagnosisCause"
  | "teamPerformance.diagnosisUnknown"
  | "teamPerformance.diagnosisConfidence"
  | "teamPerformance.diagnosisAction"
  | "teamPerformance.diagnosisEntities"
  | "teamPerformance.mediumConfidence"
  | "copilot.title"
  | "copilot.subtitle"
  | "copilot.periodLabel"
  | "copilot.period1m"
  | "copilot.period3m"
  | "copilot.period6m"
  | "copilot.period12m"
  | "copilot.periodCustom"
  | "copilot.planDateLabel"
  | "copilot.planDateToday"
  | "copilot.planningModeBadge"
  | "copilot.planningModeNotice"
  | "copilot.executionModeBadge"
  | "copilot.startVisitBlockedFuture"
  | "copilot.noCustomersForDate"
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
  | "copilot.collectedLabel"
  | "copilot.trendLabel"
  | "copilot.customer360SoldProducts"
  | "copilot.customer360StoppedProducts"
  | "copilot.customer360SalesRank"
  | "copilot.customer360SalesRankValue"
  | "copilot.customer360SoldProductsPeriod"
  | "copilot.customer360StoppedProductsPeriod"
  | "copilot.customer360ExpandAll"
  | "copilot.customer360CollapseAll"
  | "copilot.customer360NoProducts"
  | "copilot.customer360Uncategorized"
  | "copilot.customer360Quantity"
  | "copilot.customer360PreviousQuantity"
  | "copilot.customer360LastPurchase"
  | "copilot.customer360StoppedStatus"
  | "copilot.customer360DataUnavailable"
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
  | "copilot.markedVisited"
  | "copilot.summary360Button"
  | "copilot.summary360Title"
  | "copilot.summary360Loading"
  | "copilot.summary360Error"
  | "copilot.summary360Retry"
  | "copilot.summary360Empty"
  | "copilot.summary360ScopeLine"
  | "copilot.summary360ExecutiveSummary"
  | "copilot.summary360TopIssue"
  | "copilot.summary360Goal"
  | "copilot.summary360GoalTarget"
  | "copilot.summary360GoalActual"
  | "copilot.summary360GoalRemaining"
  | "copilot.summary360NoGoal"
  | "copilot.summary360LostOpportunities"
  | "copilot.summary360NoLostOpportunities"
  | "copilot.summary360NoCustomers"
  | "copilot.summary360NoBaselineSales"
  | "copilot.summary360DataUnavailable"
  | "copilot.summary360BaselineQuantity"
  | "copilot.summary360RecentQuantity"
  | "copilot.summary360SuggestedQuantity"
  | "copilot.summary360DeclineValue"
  | "copilot.summary360DeclineQuantity"
  | "copilot.summary360BeforeAfter"
  | "copilot.summary360LastVisit"
  | "copilot.summary360LastVisitUnknown"
  | "copilot.summary360StoppedProducts"
  | "copilot.summary360Diagnosis"
  | "copilot.summary360VisitDecision"
  | "copilot.summary360LikelyReason"
  | "copilot.summary360VisitGoal"
  | "copilot.summary360MoreProducts"
  | "copilot.summary360Uncategorized"
  | "copilot.summary360OpportunityCount"
  | "copilot.summary360ProductCount"
  | "copilot.summary360TotalSuggestedQuantity"
  | "copilot.summary360TotalDecline"
  | "copilot.summary360ExcludeReason"
  | "copilot.summary360ScopeCOMPANY_PRODUCT"
  | "copilot.summary360ScopeTEAM_PRODUCT"
  | "copilot.summary360ScopeSALESPERSON_PRODUCT"
  | "copilot.summary360ScopeCUSTOMER_PRODUCT"
  | "copilot.summary360ExclusionRevoked"
  | "copilot.summary360RevokeExclusion"
  | "copilot.summary360ExcludedProducts"
  | "copilot.summary360ExclusionError"
  | "copilot.summary360ExclusionSaved"
  | "copilot.summary360ExcludeConfirm"
  | "copilot.summary360ExcludeCompanyProduct"
  | "copilot.summary360ExcludeTeamProduct"
  | "copilot.summary360ExcludeSalespersonProduct"
  | "copilot.summary360ExcludeCustomerProduct"
  | "copilot.summary360ExcludeMenu"
  | "copilot.summary360Collections"
  | "copilot.summary360Collected"
  | "copilot.summary360Pending"
  | "copilot.summary360Bounced"
  | "copilot.summary360PriorityDebtors"
  | "copilot.summary360Returns"
  | "copilot.summary360ReturnsTotal"
  | "copilot.summary360ReturnsRate"
  | "copilot.summary360NoReturns"
  | "copilot.summary360InterventionNeeded"
  | "copilot.summary360RootCauses"
  | "copilot.summary360ExecutiveDecision"
  | "copilot.summary360ExecutionPlan"
  | "copilot.summary360PlanPriority"
  | "copilot.summary360PlanAction"
  | "copilot.summary360PlanOwner"
  | "copilot.summary360PlanMetric"
  | "copilot.summary360ClosingPhrase"
  | "copilot.summary360AiSourced"
  | "copilot.summary360TemplateSourced"
  | "copilot.summary360ExportPdf"
  | "copilot.summary360ExportingPdf"
  | "copilot.summary360ExportError"
  | "copilot.summary360Close"
  | "copilot.summary360ReportScope" | "copilot.summary360ScopeLabel" | "copilot.summary360ReportDate" | "copilot.summary360ComparisonPeriod"
  | "copilot.prospectVisitAdded" | "copilot.prospectVisitError" | "copilot.businessHotels" | "copilot.businessRestaurants" | "copilot.businessCafes" | "copilot.businessOther" | "copilot.minProspectScore" | "copilot.sortProspectScore" | "copilot.sortCatalogFit" | "copilot.collapseAll" | "copilot.expandAll" | "copilot.photoAttribution" | "copilot.businessTypeUnavailable" | "copilot.prospectScore" | "copilot.analysisConfidence" | "copilot.catalogFit" | "copilot.notCalculated" | "copilot.topSellingNearby" | "copilot.soldToNearbyCustomers" | "copilot.notEnoughLocalSalesData" | "copilot.basedOnNearbyCustomers" | "copilot.salesOpportunity" | "copilot.addressUnavailable" | "copilot.dataSource" | "copilot.whyThisProspect" | "copilot.directions" | "copilot.call" | "copilot.hideDetails" | "copilot.details" | "copilot.addToday" | "copilot.scheduleLater"
  | "nav.smartLoading"
  | "smartLoading.title"
  | "smartLoading.subtitle"
  | "smartLoading.summaryTitle"
  | "smartLoading.summaryDescription"
  | "smartLoading.productsToLoad"
  | "smartLoading.totalQuantity"
  | "smartLoading.priorityProducts"
  | "smartLoading.operationalPriorityProducts"
  | "smartLoading.noOperationalPriority"
  | "smartLoading.operationalPriorityProductsPanelTitle"
  | "smartLoading.lastCalculation"
  | "smartLoading.preliminaryStockNotice"
  | "smartLoading.preliminaryNeed"
  | "smartLoading.manualVehicleStock"
  | "smartLoading.manualVehicleStockHint"
  | "smartLoading.targetDate"
  | "smartLoading.routeCustomers"
  | "smartLoading.noRouteForDate"
  | "smartLoading.noRoutePriority"
  | "smartLoading.changeDateConfirm"
  | "smartLoading.attentionTitle"
  | "smartLoading.attentionDescription"
  | "smartLoading.recommendationsTitle"
  | "smartLoading.recommendationsDescription"
  | "smartLoading.suggestedLoading"
  | "smartLoading.showReason"
  | "smartLoading.vehicleStock"
  | "smartLoading.weeklyAverage"
  | "smartLoading.confirmedOrders"
  | "smartLoading.confirmedOrdersHint"
  | "smartLoading.safetyStock"
  | "smartLoading.safetyStockHint"
  | "smartLoading.empty"
  | "smartLoading.error"
  | "smartLoading.retry"
  | "smartLoading.vehicleStockUnavailable"
  | "smartLoading.vehicleStockUnavailableHint"
  | "smartLoading.checklistTitle"
  | "smartLoading.checklistDescription"
  | "smartLoading.checklist.quantities"
  | "smartLoading.checklist.priority"
  | "smartLoading.checklist.cartons"
  | "smartLoading.checklist.verified"
  | "smartLoading.checklist.organized"
  | "smartLoading.checklist.approved"
  | "smartLoading.startRoute"
  | "smartLoading.refresh"
  | "smartLoading.noOtherAlerts"
  | "smartLoading.staleProducts"
  | "smartLoading.staleProductsPage"
  | "smartLoading.staleProductsPlanTitle"
  | "smartLoading.staleProductsLoading"
  | "smartLoading.staleProductsError"
  | "smartLoading.noStaleProducts"
  | "smartLoading.selectStaleProduct"
  | "smartLoading.noPurchasingCustomers"
  | "smartLoading.customer"
  | "smartLoading.totalPurchasedQuantity"
  | "smartLoading.purchaseFrequency"
  | "smartLoading.lastPurchaseDate"
  | "smartLoading.daysStale"
  | "smartLoading.productLabel"
  | "smartLoading.openAllSections"
  | "smartLoading.closeAllSections"
  | "smartLoading.practicalDecision"
  | "smartLoading.customerEvidence"
  | "smartLoading.staleProductsPanelTitle"
  | "smartLoading.priorityProductsPanelTitle"
  | "smartLoading.close"
  | "smartLoading.uncategorized"
  | "smartLoading.restore"
  | "smartLoading.manualOverrideNote"
  | "smartLoading.quantityUnit"
  | "smartLoading.lastSale"
  | "smartLoading.staleDaysUnit"
  | "smartLoading.noStaleSalesOverThreshold"
  | "smartLoading.missingLastSaleData"
  | "smartLoading.salesDataDetails"
  | "smartLoading.productsWithRecentSales"
  | "smartLoading.productsWithStaleSales"
  | "smartLoading.productsWithoutLastSaleDate"
  | "smartLoading.exportExcel"
  | "smartLoading.exportOds"
  | "smartLoading.exportColumnProduct"
  | "smartLoading.exportColumnCategory"
  | "smartLoading.export"
  | "smartLoading.refreshing"
  | "smartLoading.refreshFailed"
  | "smartLoading.exportColumnSource"
  | "smartLoading.addedManually"
  | "smartLoading.recommended"
  | "smartLoading.addProduct"
  | "smartLoading.addProductDescription"
  | "smartLoading.searchProducts"
  | "smartLoading.noProductsFound"
  | "smartLoading.manualQuantity"
  | "smartLoading.removeProduct"
  | "smartLoading.restoreOriginalList"
  | "smartLoading.alertsTitle"
  | "smartLoading.lostOpportunities"
  | "smartLoading.lostOpportunitiesDescription"
  | "smartLoading.lostOpportunityCategories"
  | "smartLoading.lostOpportunityProducts"
  | "smartLoading.lostOpportunityCustomers"
  | "smartLoading.searchLostOpportunities"
  | "smartLoading.lostOpportunitiesError"
  | "smartLoading.noLostOpportunities"
  | "smartLoading.categoryTotal"
  | "smartLoading.categoryPartiallyAdded"
  | "smartLoading.productSuggestedQuantity"
  | "smartLoading.customerSuggestedQuantity"
  | "smartLoading.addCategory"
  | "smartLoading.addToLoading"
  | "smartLoading.added"
  | "smartLoading.vehicleStockQuantity"
  | "smartLoading.reviewCapacity"
  | "smartLoading.pdfExportedAt"
  | "smartLoading.routeSetup"
  | "smartLoading.fromDate"
  | "smartLoading.toDate"
  | "smartLoading.invalidDateRange"
  | "smartLoading.calendarDays"
  | "smartLoading.visitsPerWeek"
  | "smartLoading.onceWeekly"
  | "smartLoading.twiceWeekly"
  | "smartLoading.sixWeekly"
  | "smartLoading.visitsHint"
  | "smartLoading.visitCustomers"
  | "smartLoading.selectedCustomers"
  | "smartLoading.searchCustomers"
  | "smartLoading.noCustomersFound"
  | "smartLoading.noSelectedCustomers"
  | "smartLoading.aggregatedConfirmedOrders"
  | "smartLoading.selectProduct"
  | "smartLoading.add"
  | "smartLoading.remove"
  | "smartLoading.orderTotals"
  | "smartLoading.currentRecommendations"
  | "smartLoading.awaitingCalculation"
  | "smartLoading.noRecommendations"
  | "smartLoading.estimatedDemand"
  | "smartLoading.estimatedSuggestedQuantity"
  | "smartLoading.editRoute"
  | "smartLoading.sessionSummary"
  | "smartLoading.noConfirmedOrders"
  | "smartLoading.exceptionalCustomer"
  | "smartLoading.applyAndClose"
  | "smartLoading.exceptionalCustomers"
  | "fsos360.company"
  | "fsos360.region"
  | "fsos360.city"
  | "fsos360.branch"
  | "fsos360.manager"
  | "fsos360.supervisor"
  | "fsos360.route"
  | "fsos360.salesRep"
  | "fsos360.customer"
  | "fsos360.brand"
  | "fsos360.category"
  | "fsos360.product"
  | "fsos360.title"
  | "fsos360.subtitle"
  | "fsos360.refresh"
  | "fsos360.filters"
  | "fsos360.filtersDescription"
  | "fsos360.currentPeriod"
  | "fsos360.comparisonPeriod"
  | "fsos360.analysisFocus"
  | "fsos360.auto"
  | "fsos360.removedSelections"
  | "fsos360.loading"
  | "fsos360.error"
  | "fsos360.executiveInsight"
  | "fsos360.noInsight"
  | "fsos360.kpiSummary"
  | "fsos360.comparedToPrevious"
  | "fsos360.performanceComparison"
  | "fsos360.indicator"
  | "fsos360.current"
  | "fsos360.previous"
  | "fsos360.change"
  | "fsos360.changePercent"
  | "fsos360.timeline"
  | "fsos360.target"
  | "fsos360.targetValue"
  | "fsos360.achievement"
  | "fsos360.achievementPercent"
  | "fsos360.remaining"
  | "fsos360.visualization"
  | "fsos360.visualizationDescription"
  | "fsos360.totalRows"
  | "fsos360.mappedRows"
  | "fsos360.unmappedRows"
  | "fsos360.routePointsOnly"
  | "fsos360.empty"
  | "fsos360.notAvailable"
  | "fsos360.opportunities"
  | "fsos360.recommendations"
  | "fsos360.search"
  | "fsos360.unavailable"
  | "fsos360.noResults"
  | "fsos360.clear"
  | "fsos360.next"
  | "fsos360.available"
  | "fsos360.partial"
  | "fsos360.not-applicable"
  | "fsos360.pending-business-approval"
  | "fsos360.focus.company"
  | "fsos360.focus.region"
  | "fsos360.focus.branch"
  | "fsos360.focus.manager"
  | "fsos360.focus.supervisor"
  | "fsos360.focus.route"
  | "fsos360.focus.sales-rep"
  | "fsos360.focus.customer"
  | "fsos360.focus.brand"
  | "fsos360.focus.category"
  | "fsos360.focus.product"
  | "fsos360.kpi.sales"
  | "fsos360.kpi.collections"
  | "fsos360.kpi.returns"
  | "fsos360.kpi.lost-sales"
  | "fsos360.kpi.orders"
  | "fsos360.kpi.coverage"
  | "fsos360.kpi.strike-rate"
  | "fsos360.kpi.productivity"
  | "fsos360.kpi.sales.change"
  | "fsos360.kpi.collections.change"
  | "fsos360.kpi.returns.change"
  | "fsos360.kpi.orders.change"
  | "fsos360.kpi.coverage.change"
  | "fsos360.kpi.strikeRate.change"
  | "fsos360.kpi.productivity.change"
  | "fsos360.reason.customers-dataset-unavailable"
  | "fsos360.reason.products-dataset-unavailable"
  | "fsos360.reason.pending-business-approval"
  | "fsos360.reason.sgi-filter-scope-not-supported"
  | "fsos360.reason.lost-sales-aggregation-and-deduplication-unapproved"
  | "fsos360.reason.route-assignment-history-unavailable"
  | "fsos360.reason.route-month-target-source"
  | "fsos360.reason.targets-dataset-unavailable"
  | "fsos360.reason.ambiguous-analysis-focus"
  | "fsos360.reason.manager-supervisor-role-ambiguous"
  | "fsos360.reason.invoices-dataset-unavailable"
  | "fsos360.reason.filter-not-supported"
  | "fsos360.reason.zero-denominator"
  | "fsos360.reason.analysis-level-does-not-own-target"
  | "fsos360.reason.partial-period"
  | "fsos360.reason.incomplete-target-coverage"
  | "fsos360.reason.analysis-unavailable"
  | "fsos360.reason.product-filter-not-supported-for-collections"
  | "fsos360.reason.product-filter-not-supported-for-returns"
  | "fsos360.reason.product-filter-not-supported-for-visits"
  | "fsos360.reason.products-or-invoices-dataset-unavailable"
  | "fsos360.reason.missing-dataset"
  | "fsos360.visualization.timeline"
  | "fsos360.visualization.line"
  | "fsos360.visualization.bar"
  | "fsos360.visualization.treemap"
  | "fsos360.visualization.heat-map"
  | "fsos360.visualization.coverage-map"
  | "fsos360.visualization.route-map"
  | "fsos360.visualization.customer-density";

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  ar: {
    "routePlanning.splitComplete": "تم التقسيم — ", "routePlanning.customersAcross": " عميل على ", "routePlanning.groups": " مجموعات", "routePlanning.splitError": "تعذر إتمام التقسيم", "routePlanning.selectedValues": " قيمة محددة", "routePlanning.customersUsed": " عميل مستخدم", "routePlanning.coverage": "نسبة التغطية: ", "routePlanning.targetAverage": "المتوسط المستهدف: ", "routePlanning.maxDeviation": "أقصى انحراف: ", "routePlanning.invalidCoordinates": " صف مستبعد (إحداثيات غير صالحة)", "routePlanning.newRoute": "خط جديد ", "routePlanning.groupPrefix": "مجموعة ",
    "routePlanning.exportCustomerId": "رقم العميل", "routePlanning.exportName": "الاسم", "routePlanning.exportLatitude": "خط العرض", "routePlanning.exportLongitude": "خط الطول", "routePlanning.exportBeforeRoute": "الخط (قبل)", "routePlanning.exportAfterRoute": "الخط (بعد)", "routePlanning.exportSheet": "التقسيم", "routePlanning.exportFilePrefix": "تقسيم",
    "dashboard.refresh": "تحديث البيانات",
    "routePlanning.title": "تخطيط المسارات", "routePlanning.subtitle": "أعد تقسيم قطاع أو خط سير إلى مجموعات متوازنة في المبيعات ومتماسكة جغرافيًا.", "routePlanning.settings": "الإعدادات", "routePlanning.scopeField": "عمود النطاق (مندوب/منطقة)", "routePlanning.selectField": "اختر عمودًا…", "routePlanning.groupCount": "عدد المجموعات", "routePlanning.groupCountHint": "يتزامن تلقائيًا مع عدد القيم المحددة. عدّله يدويًا لدمج مسارات أو إضافة مسار جديد.", "routePlanning.restoreAuto": "إعادة التزامن التلقائي", "routePlanning.splitting": "جارٍ التقسيم…", "routePlanning.splitNow": "قسّم الآن", "routePlanning.scopeValues": "قيم النطاق (اختر واحدة أو أكثر قبل التقسيم)", "routePlanning.selectAll": "تحديد الكل", "routePlanning.clearAll": "إلغاء الكل", "routePlanning.chooseScopeFirst": "اختر عمود النطاق أولاً", "routePlanning.loading": "جارٍ التحميل…", "routePlanning.noValues": "لا توجد قيم في هذا العمود", "routePlanning.result": "النتيجة", "routePlanning.before": "قبل (جغرافي فقط)", "routePlanning.after": "بعد (متوازن)", "routePlanning.showPerformance": "عرض الأداء", "routePlanning.export": "تصدير Excel", "routePlanning.routeName": "اسم الخط", "routePlanning.customers": "العملاء", "routePlanning.sales": "المبيعات", "routePlanning.averageCustomer": "متوسط لكل عميل", "routePlanning.deviation": "الانحراف", "routePlanning.performance": "الأداء", "routePlanning.good": "جيد", "routePlanning.average": "متوسط", "routePlanning.weak": "ضعيف", "routePlanning.scopeRoute": "الخط", "routePlanning.scopeCity": "المدينة", "routePlanning.scopeCustomerClass": "فئة العميل", "routePlanning.scopeChannel": "القناة", "routePlanning.group": "مجموعة {count}",
    "visitCopilotPreview.preview": "نسخة واجهة مؤقتة للمراجعة", "visitCopilotPreview.title": "مساعد الزيارة الذكي", "visitCopilotPreview.subtitle": "قرار واحد واضح لكل زيارة، بدون تقارير أو تفاصيل زائدة.", "visitCopilotPreview.period": "نطاق التحليل", "visitCopilotPreview.period1m": "آخر شهر", "visitCopilotPreview.period3m": "آخر 3 أشهر", "visitCopilotPreview.period6m": "آخر 6 أشهر", "visitCopilotPreview.period12m": "آخر 12 شهرًا", "visitCopilotPreview.periodCustom": "فترة مخصصة", "visitCopilotPreview.from": "من", "visitCopilotPreview.to": "إلى", "visitCopilotPreview.vanStock": "مراعاة مخزون السيارة", "visitCopilotPreview.customDateRequired": "حدّد تاريخ البداية والنهاية أولًا.", "visitCopilotPreview.mode1": "وضع 1", "visitCopilotPreview.mode2": "وضع 2", "visitCopilotPreview.todayPlan": "خطة زيارات اليوم", "visitCopilotPreview.selectCustomer": "اختر عميلًا لبدء الزيارة", "visitCopilotPreview.noVisits": "لا توجد زيارات متاحة اليوم.", "visitCopilotPreview.visitMode": "وضع الزيارة", "visitCopilotPreview.mission": "مهمة الزيارة", "visitCopilotPreview.priority": "الأولوية {value}", "visitCopilotPreview.missionNote": "تصنيف المهمة مؤقت للعرض حتى ربطه بمحرك الذكاء.", "visitCopilotPreview.recommendations": "توصيات الذكاء الاصطناعي", "visitCopilotPreview.geoIntelligence": "ذكاء الموقع", "visitCopilotPreview.previewData": "بيانات واجهة مؤقتة", "visitCopilotPreview.geoDescription": "أفضل ثلاث فرص لدى العملاء القريبين على مسار اليوم.", "visitCopilotPreview.askAi": "اسأل الذكاء الاصطناعي",
    "analysisStudio.title": "استوديو التحليل",
    "analysisStudio.subtitle": "اسأل Custom GPT سؤالك المعتاد. عندما تتضمن الإجابة جدولاً أو رسماً بيانياً أو خريطة، ستظهر هنا أيضاً.",
    "analysisStudio.clear": "مسح العرض",
    "analysisStudio.unavailable": "سجل التحليلات غير متاح مؤقتاً. يمكنك الاستمرار في تشغيل GPT.",
    "analysisStudio.empty": "لا توجد تحليلات هنا بعد. شغّل GPT أعلاه واسأله سؤالاً لتظهر إجابته هنا.",
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
    "nav.reports": "التقارير",
    "nav.sgi": "مركز فرص النمو",
    "nav.territoryIntelligence": "ذكاء الأقاليم",
    "nav.decisionAnalyticsStudio": "استوديو تحليل القرارات",
    "nav.fsos360": "FSOS 360",
    "nav.geoEngine": "محرك الخرائط الذكي",
    "nav.visitCopilot": "مساعد الزيارات",
    "nav.team": "الفريق",
    "nav.employees": "الموظفون",
    "nav.settings": "الإعدادات",
    "nav.account": "الحساب",
    "admin.nav.dashboard": "لوحة الإدارة",
    "admin.nav.users": "المستخدمون",
    "admin.nav.companies": "الشركات",
    "admin.nav.subscriptions": "الاشتراكات",
    "admin.nav.payments": "المدفوعات",
    "admin.nav.accessControl": "إدارة الصلاحيات",
    "admin.nav.usage": "إحصاءات الاستخدام",
    "admin.nav.settings": "إعدادات المنصة",
    "territoryIntelligence.title": "ذكاء الأقاليم",
    "territoryIntelligence.subtitle": "مش خريطة بس — كل إقليم بيقولك مشكلته، السبب، والقرار المناسب.",
    "territoryIntelligence.libraryTitle": "مكتبة الذكاء",
    "territoryIntelligence.categoryPerformance": "📊 الأداء",
    "territoryIntelligence.categoryRisk": "⚠️ المخاطر",
    "territoryIntelligence.categoryOpportunity": "💡 الفرص",
    "territoryIntelligence.categoryTerritory": "🗺️ ذكاء الإقليم",
    "territoryIntelligence.metricHealthScore": "مؤشر الصحة",
    "territoryIntelligence.metricSalesGrowth": "نمو المبيعات",
    "territoryIntelligence.metricActiveCustomerRate": "نسبة العملاء النشطين",
    "territoryIntelligence.metricLostSales": "مبيعات متوقفة",
    "territoryIntelligence.metricVisitCoverage": "تغطية الزيارات",
    "territoryIntelligence.metricCollectionHealth": "صحة التحصيل",
    "territoryIntelligence.metricOpportunityValue": "قيمة الفرصة",
    "territoryIntelligence.tierExcellent": "ممتاز",
    "territoryIntelligence.tierGood": "جيد",
    "territoryIntelligence.tierAverage": "متوسط",
    "territoryIntelligence.tierWeak": "ضعيف",
    "territoryIntelligence.tierVeryWeak": "ضعيف جدًا",
    "territoryIntelligence.panelSummaryTab": "ملخص",
    "territoryIntelligence.panelPerformanceTab": "الأداء",
    "territoryIntelligence.panelRiskTab": "المخاطر",
    "territoryIntelligence.panelOpportunityTab": "الفرص",
    "territoryIntelligence.panelComparisonTab": "مقارنة",
    "territoryIntelligence.panelWhyTitle": "ليه؟",
    "territoryIntelligence.panelRecommendationTitle": "التوصية الذكية",
    "territoryIntelligence.panelSuggestedActionsTitle": "القرار المقترح",
    "territoryIntelligence.panelExpectedImpactTitle": "العائد المتوقع",
    "territoryIntelligence.panelCtaCreateVisitPlan": "إنشاء خطة زيارات للإقليم",
    "territoryIntelligence.panelClose": "إغلاق",
    "territoryIntelligence.rankingTitle": "ترتيب الأقاليم",
    "territoryIntelligence.rankingCustomersBadge": "{count} عميل",
    "territoryIntelligence.emptyState": "لا توجد بيانات كافية لعرض الأقاليم حاليًا.",
    "territoryIntelligence.loading": "جارٍ تحميل ذكاء الأقاليم...",
    "territoryIntelligence.errorLoad": "حصل خطأ في تحميل بيانات الأقاليم.",
    "territoryIntelligence.executiveModeToggle": "الوضع التنفيذي",
    "territoryIntelligence.executiveTopOpportunities": "أفضل 5 فرص",
    "territoryIntelligence.executiveWorstTerritories": "أضعف 5 أقاليم",
    "territoryIntelligence.executiveFastestWin": "أسرع مكسب",
    "territoryIntelligence.executiveBiggestRisk": "أكبر خطر",
    "territoryIntelligence.executiveViewMap": "عرض الخريطة",
    "territoryIntelligence.quickToolsTitle": "أدوات سريعة",
    "territoryIntelligence.exportPpt": "تصدير PPT",
    "territoryIntelligence.exportImage": "تصدير صورة",
    "territoryIntelligence.selectTerritoryHint": "اختر إقليمًا من الخريطة أو الترتيب لعرض التفاصيل.",
    "territoryIntelligence.comparisonPickSecond": "اختر إقليمًا ثانيًا للمقارنة",
    "territoryIntelligence.comparisonTitle": "مقارنة الأقاليم",
    "territoryIntelligence.noWhyItems": "مفيش ملاحظات مسجلة لهذا الإقليم دلوقتي.",
    "territoryIntelligence.breadcrumbRoot": "كل الأقاليم",
    "territoryIntelligence.levelCity": "المدينة",
    "territoryIntelligence.levelCustomer": "العميل",
    "territoryIntelligence.goUp": "رجوع لمستوى أعلى",
    "territoryIntelligence.drillIntoHint": "اضغط لعرض العملاء داخل هذا الإقليم",
    "territoryIntelligence.metricRiskLevel": "مستوى الخطورة",
    "territoryIntelligence.riskHigh": "مرتفع",
    "territoryIntelligence.riskMedium": "متوسط",
    "territoryIntelligence.riskLow": "منخفض",
    "territoryIntelligence.panelLastUpdated": "آخر تحديث",
    "territoryIntelligence.panelRanking": "الترتيب",
    "territoryIntelligence.panelRankingValue": "{rank} من {total}",
    "territoryIntelligence.panelVsLastMonth": "مقارنة بالشهر السابق",
    "territoryIntelligence.panelAiInsightTitle": "تحليل الذكاء الاصطناعي",
    "territoryIntelligence.panelGrowthOpportunitiesTitle": "فرص النمو",
    "territoryIntelligence.panelVisitPlanTitle": "خطة الزيارة المقترحة",
    "territoryIntelligence.panelVisitPlanHint": "ابدأ بتنفيذ التوصيات دي في خطة الزيارات القادمة.",
    "territoryIntelligence.panelCompareBtn": "مقارنة الأقاليم",
    "territoryIntelligence.panelExportBtn": "تصدير التقرير",
    "territoryIntelligence.panelShareBtn": "مشاركة",
    "territoryIntelligence.customerLevelTitle": "عملاء {name}",
    "territoryIntelligence.customerLevelHint": "أعلى العملاء من حيث المبيعات داخل هذا الإقليم",
    "territoryIntelligence.customerLevelEmpty": "مفيش عملاء بإحداثيات صالحة في هذا الإقليم.",
    "territoryIntelligence.customerSalesLabel": "المبيعات",
    "territoryIntelligence.boundarySourcePlaceholder": "بيانات حدود تقريبية (نسخة تجريبية)",
    "territoryIntelligence.layersPanelTitle": "طبقات التحليل",
    "territoryIntelligence.layerActiveBadge": "نشطة",
    "territoryIntelligence.displayModeHeat": "حرارية",
    "territoryIntelligence.displayModeCluster": "عنقودية",
    "territoryIntelligence.displayModePoints": "نقطية",
    "territoryIntelligence.displayModeSectionTitle": "نوع الخريطة",
    "territoryIntelligence.invalidCoordinatesNotice": "{count} موقع بإحداثيات غير صالحة تم استبعاده",
    "territoryIntelligence.coLocatedCustomers": "{count} عميل بنفس الموقع — اضغط للتفريق",
    "territoryIntelligence.metricNoData": "لا توجد بيانات",
    "territoryIntelligence.customersCountSuffix": "عميل",
    "territoryIntelligence.aggregationSum": "إجمالي",
    "territoryIntelligence.aggregationAverage": "متوسط",
    "territoryIntelligence.legendLow": "منخفض",
    "territoryIntelligence.legendHigh": "مرتفع",
    "territoryIntelligence.exportCsv": "تصدير CSV",
    "territoryIntelligence.exportSuccess": "تم التصدير بنجاح",
    "territoryIntelligence.exportError": "تعذّر التصدير — حاول مرة أخرى",
    "territoryIntelligence.exporting": "جارِ التصدير...",
    "territoryIntelligence.exportTotalCustomers": "عدد العملاء",
    "territoryIntelligence.exportUniqueLocations": "عدد المواقع الفريدة",
    "territoryIntelligence.exportExcludedCoordinates": "إحداثيات مستبعدة",
    "territoryIntelligence.exportScopeAll": "كل الأقاليم",
    "territoryIntelligence.metricSectionTitle": "المؤشر",
    "territoryIntelligence.returnToDecisionStudio": "الرجوع لاستوديو تحليل القرارات",
    "decisionAnalyticsStudio.title": "استوديو تحليل القرارات",
    "decisionAnalyticsStudio.subtitle": "حلل مبيعاتك من أي زاوية، واكتشف الفرص والمخاطر في لمحة واحدة.",
    "decisionAnalyticsStudio.resetFilters": "إعادة تعيين الفلاتر",
    "decisionAnalyticsStudio.openTerritoryIntelligence": "فتح ذكاء الأقاليم",
    "decisionAnalyticsStudio.dateRangeSeparator": "إلى",
    "decisionAnalyticsStudio.activeFiltersCount": "{count} فلتر نشط",
    "decisionAnalyticsStudio.loading": "جارٍ تحميل التحليل...",
    "decisionAnalyticsStudio.permissionDenied": "ليس لديك صلاحية لعرض هذه الشاشة.",
    "decisionAnalyticsStudio.errorLoad": "حصل خطأ في تحميل بيانات التحليل.",
    "decisionAnalyticsStudio.noData": "لا توجد بيانات فواتير مرفوعة بعد لعرض هذا التحليل.",
    "decisionAnalyticsStudio.emptyResult": "لا توجد نتائج للفلاتر والفترة الزمنية المحددة.",
    "decisionAnalyticsStudio.filterBranch": "الفرع",
    "decisionAnalyticsStudio.filterTerritory": "الإقليم",
    "decisionAnalyticsStudio.filterChannel": "القناة",
    "decisionAnalyticsStudio.filterCategory": "الفئة",
    "decisionAnalyticsStudio.filterBrand": "العلامة التجارية",
    "decisionAnalyticsStudio.filterProduct": "المنتج",
    "decisionAnalyticsStudio.filterCustomer": "العميل",
    "decisionAnalyticsStudio.filterRepresentative": "المندوب",
    "decisionAnalyticsStudio.filterSupervisor": "المشرف",
    "decisionAnalyticsStudio.kpiSales": "المبيعات",
    "decisionAnalyticsStudio.kpiGrowth": "النمو",
    "decisionAnalyticsStudio.kpiCoverage": "التغطية",
    "decisionAnalyticsStudio.kpiOrders": "عدد الطلبات",
    "decisionAnalyticsStudio.kpiCollections": "التحصيلات",
    "decisionAnalyticsStudio.kpiStrikeRate": "معدل نجاح الزيارات",
    "decisionAnalyticsStudio.kpiActiveCustomers": "العملاء النشطون",
    "decisionAnalyticsStudio.kpiLostSales": "مبيعات متوقفة",
    "decisionAnalyticsStudio.kpiAverageOrder": "متوسط الطلب",
    "decisionAnalyticsStudio.kpiProductivity": "الإنتاجية",
    "decisionAnalyticsStudio.dimTerritory": "الإقليم",
    "decisionAnalyticsStudio.dimChannel": "القناة",
    "decisionAnalyticsStudio.dimCategory": "الفئة",
    "decisionAnalyticsStudio.dimBrand": "العلامة التجارية",
    "decisionAnalyticsStudio.dimProduct": "المنتج",
    "decisionAnalyticsStudio.dimCustomer": "العميل",
    "decisionAnalyticsStudio.dimRepresentative": "المندوب",
    "decisionAnalyticsStudio.dimSupervisor": "المشرف",
    "decisionAnalyticsStudio.drillHint": "اضغط على أي عنصر للتعمق فيه",
    "decisionAnalyticsStudio.chartColumn": "أعمدة",
    "decisionAnalyticsStudio.chartBar": "أشرطة",
    "decisionAnalyticsStudio.chartLine": "خطي",
    "decisionAnalyticsStudio.chartArea": "مساحي",
    "decisionAnalyticsStudio.chartStacked": "متراكم",
    "decisionAnalyticsStudio.chartPie": "دائري",
    "decisionAnalyticsStudio.chartTreemap": "خريطة شجرية",
    "decisionAnalyticsStudio.chartScatter": "تشتت",
    "decisionAnalyticsStudio.chartPareto": "باريتو",
    "decisionAnalyticsStudio.chartTable": "جدول",
    "decisionAnalyticsStudio.otherSlice": "أخرى",
    "decisionAnalyticsStudio.tooltipTarget": "الهدف",
    "decisionAnalyticsStudio.tooltipAchievement": "نسبة التحقيق",
    "decisionAnalyticsStudio.tableColLabel": "العنصر",
    "decisionAnalyticsStudio.aiInsightTitle": "تحليل الذكاء الاصطناعي",
    "decisionAnalyticsStudio.aiInsightEmpty": "لا توجد ملاحظات مسجلة للنطاق الحالي.",
    "decisionAnalyticsStudio.severityHigh": "مرتفع",
    "decisionAnalyticsStudio.severityMedium": "متوسط",
    "decisionAnalyticsStudio.severityLow": "منخفض",
    "decisionAnalyticsStudio.detailTableTitle": "تفاصيل الفواتير",
    "decisionAnalyticsStudio.detailTableCount": "{count} سطر",
    "decisionAnalyticsStudio.colInvoice": "رقم الفاتورة",
    "decisionAnalyticsStudio.colDate": "التاريخ",
    "decisionAnalyticsStudio.colCustomer": "العميل",
    "decisionAnalyticsStudio.colProduct": "المنتج",
    "decisionAnalyticsStudio.pageOf": "صفحة {page} من {total}",
    "geoEngine.title": "محرك الخرائط الذكي",
    "geoEngine.subtitle": "معاينة المرحلة الأولى: الفلاتر الموحدة ومحرك البيانات الجديد لكل خرائط FSOS.",
    "geoEngine.phase1Notice": "هذه معاينة للمرحلة الأولى (المحرك والفلاتر فقط) — الخريطة الحرارية والفقاعية والعنقودية والمساحية بأسلوبها النهائي جزء من المرحلة الثانية. الهدف هنا التأكد إن الفلاتر الموحدة والبيانات صحيحة.",
    "geoEngine.phase2Notice": "المرحلة الثانية: بدّل بين أنماط الخريطة (حرارية / فقاعية / عنقودية / مناطق) — كلها بتقرأ من نفس المحرك والفلاتر. الـ Drill Down وربط الذكاء الاصطناعي جزء من المرحلة الثالثة.",
    "geoEngine.phase3Notice": "المرحلة الثالثة: اضغط على أي نقطة في الخريطة أو أي عمود في الرسم البياني للتنقل بين المدينة والعميل، وكل شيء في الشاشة (المؤشرات والرسم ولوحة الذكاء الاصطناعي وجدول التفاصيل) بيتحدث معاك تلقائيًا.",
    "geoEngine.modeLabel": "نمط الخريطة",
    "geoEngine.modeHeat": "حرارية",
    "geoEngine.modeBubble": "فقاعية",
    "geoEngine.modeCluster": "عنقودية",
    "geoEngine.modeTerritory": "مناطق",
    "geoEngine.dateFromLabel": "من تاريخ",
    "geoEngine.dateToLabel": "إلى تاريخ",
    "geoEngine.kpiLabel": "المؤشر",
    "geoEngine.groupByLabel": "التجميع حسب",
    "geoEngine.groupByCustomer": "عميل",
    "geoEngine.groupByCity": "مدينة",
    "geoEngine.kpiSales": "المبيعات",
    "geoEngine.kpiOrders": "عدد الطلبات",
    "geoEngine.kpiCustomers": "كثافة العملاء",
    "geoEngine.kpiVisits": "الزيارات",
    "geoEngine.kpiCollections": "التحصيلات",
    "geoEngine.kpiReturns": "المرتجعات",
    "geoEngine.kpiLostSales": "مبيعات متوقفة",
    "geoEngine.filterBranch": "الفرع",
    "geoEngine.filterCity": "المدينة",
    "geoEngine.filterChannel": "القناة",
    "geoEngine.filterCategory": "الفئة",
    "geoEngine.filterBrand": "العلامة التجارية",
    "geoEngine.filterProduct": "المنتج",
    "geoEngine.filterCustomer": "العميل",
    "geoEngine.filterRepresentative": "المندوب",
    "geoEngine.filterSupervisor": "المشرف",
    "geoEngine.updateButton": "تحديث الخريطة",
    "geoEngine.updatingButton": "جارٍ التحديث...",
    "geoEngine.loading": "جارٍ التحميل...",
    "geoEngine.errorLoad": "حصل خطأ في تحميل البيانات.",
    "geoEngine.emptyResult": "لا توجد نتائج للفلاتر والفترة الزمنية المحددة.",
    "geoEngine.pointsBadge": "{count} نقطة",
    "geoEngine.totalBadge": "الإجمالي: {total}",
    "geoEngine.excludedBadge": "{count} بدون إحداثيات صحيحة",
    "geoEngine.chartTitle": "أعلى 10 حسب القيمة",
    "geoEngine.kpiCardTotal": "الإجمالي",
    "geoEngine.kpiCardMax": "أعلى قيمة",
    "geoEngine.kpiCardPoints": "عدد النقاط",
    "geoEngine.kpiCardExcluded": "إحداثيات مستبعدة",
    "geoEngine.executiveReset": "إعادة ضبط العرض",
    "geoEngine.executiveFullscreen": "ملء الشاشة",
    "geoEngine.executiveExitFullscreen": "الخروج من ملء الشاشة",
    "geoEngine.executiveExportImage": "تصدير صورة",
    "geoEngine.executiveExportPdf": "تصدير PDF",
    "geoEngine.executiveExportError": "تعذّر التصدير، حاول مرة أخرى.",
    "shell.brand": "مرشدك",
    "shell.tagline": "ذكاء المبيعات في يدك",
    "shell.logout": "تسجيل الخروج",
    "shell.more": "المزيد",
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
    "files.employeeExportsTitle": "تصدير بيانات الموظفين",
    "files.employeeExportsSubtitle": "صدّر ملف إكسل مفلتر لموظف معيّن — يحتوي فقط على البيانات المصرح لهذا الموظف برؤيتها، جاهز لرفعه في محادثة GPT الخاصة به.",
    "files.employeeExportsEmpty": "لا يوجد موظفون متاحون للتصدير حاليًا.",
    "files.exportRangeAll": "كل الفترات",
    "files.exportRangeLast1Month": "آخر شهر",
    "files.exportRangeLast3Months": "آخر 3 شهور",
    "files.exportRangeLast6Months": "آخر 6 شهور",
    "files.exportRangeLast12Months": "آخر 12 شهر",
    "files.exportRangeFrom": "من تاريخ",
    "files.exportRangeTo": "إلى تاريخ",
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
    "files.batchSkipped": "\"{fileName}\" — {count} شيت متجاهل لأنه موجود بالفعل وشغال بنفس المحتوى: {entities}",
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
    "assistant.adviceLabel": "نصيحة",
    "assistant.decisionLabel": "القرار",
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
    "heatmap.layersEnable": "طبقات متعددة (قارن أكتر من قيمة مع بعض)",
    "heatmap.layersDisable": "إلغاء الطبقات المتعددة",
    "heatmap.layerDimensionLabel": "بُعد الطبقة",
    "heatmap.layersHint": "اختار قيمة أو أكتر — كل قيمة هتظهر كطبقة حرارية لوحدها تقدر تولّعها/تطفيها من القايمة اللي هتظهر جنب الخريطة في النتيجة.",
    "heatmap.layersBadge": "{count} طبقة",
    "heatmap.exportExcelButton": "تصدير Excel",
    "heatmap.sheetName": "الخريطة الحرارية",
    "heatmap.fileName": "الخريطة-الحرارية.xlsx",
    "heatmap.colLayer": "الطبقة",
    "heatmap.colLabel": "الموقع",
    "heatmap.colMetric": "المقياس",
    "heatmap.colValue": "القيمة",
    "heatmap.colLat": "خط العرض",
    "heatmap.colLon": "خط الطول",
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
    "sgi.title": "مركز فرص النمو",
    "sgi.subtitle": "أفضل فرص النمو والتحصيل والاسترجاع المتاحة حاليًا، مرتبة حسب الأولوية.",
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
    "sgi.performanceKpis": "مؤشرات الأداء",
    "sgi.actualSales": "المبيعات الفعلية",
    "sgi.activeCustomers": "العملاء النشطون",
    "sgi.kpiLoading": "جارٍ تحميل مؤشرات الأداء…",
    "sgi.kpiNoRepStats": "لا توجد مؤشرات أداء متاحة لهذا التقرير.",
    "sgi.kpiMissingCurrentUserEmail": "تعذر تحديد بريد المستخدم لعرض مؤشرات الأداء.",
    "sgi.kpiEmptyTeam": "لا يوجد مندوبون ضمن فريقك في هذا التقرير.",
    "sgi.exportPdf": "تصدير تقرير PDF",
    "sgi.exportPdfPending": "جاري إنشاء التقرير…",
    "sgi.exportPdfError": "تعذّر تصدير التقرير",
    "sgi.pdfReportTitle": "مركز فرص النمو — تقرير",
    "sgi.pdfGeneratedAtLabel": "تاريخ التقرير",
    "sgi.pdfExecutiveSummaryTitle": "ملخص تنفيذي",
    "sgi.pdfTotalOpportunitiesLabel": "إجمالي الفرص",
    "sgi.pdfHighSeverityLabel": "أولوية عالية",
    "sgi.pdfTargetAchievementTitle": "نسبة تحقيق الهدف الشهري",
    "sgi.pdfTargetAchievedOf": "{actual} من {target} ({pct}%)",
    "sgi.pdfNoTargetNote": "لا يوجد هدف شهري مسجّل لهذه الفترة.",
    "sgi.pdfTopByCategoryTitle": "أهم الفرص حسب التصنيف",
    "sgi.pdfDeferredTitle": "أنواع فرص غير مدعومة حاليًا",
    "sgi.pdfDeferredNote": "الأنواع التالية (متوسط الفاتورة، موعد الاستحقاق، Up-sell، الفرص الجغرافية) تحتاج بيانات وقواعد أعمال معتمدة غير متوفرة حاليًا في نظام SGI — لم يتم اختراع منطق لها. Deferred — requires approved backend data and business rules.",
    "sgi.pdfFullListTitle": "التفاصيل الكاملة مرتبة حسب الأولوية",
    "sgi.pdfNoOwnerLabel": "غير محدد",
    "employees.title": "الموظفون",
    "employees.subtitle": "السجل الرسمي لموظفي الشركة — مستقل تمامًا عن حسابات الدخول (المستخدمين). الموظف سجل عمل، مش حساب دخول.",
    "employees.addEmployee": "إضافة موظف",
    "employees.resyncFromUpload": "مزامنة من الملف المرفوع",
    "employees.resyncSuccess": "تمت المزامنة — {count} موظف من الملف المرفوع.",
    "employees.resyncNoDataset": "لا يوجد ملف موظفين مرفوع حاليًا للمزامنة منه.",
    "employees.resyncError": "تعذّرت المزامنة. حاول مرة أخرى.",
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
    "employees.exportData": "تصدير بيانات الموظف (Excel)",
    "employees.toastExportError": "تعذر تصدير بيانات الموظف",
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
    "account.title": "الحساب والأمان",
    "account.subtitle": "راجع بيانات حسابك وأدِر كلمة المرور بأمان.",
    "account.profileTitle": "معلومات الحساب",
    "account.name": "الاسم",
    "account.email": "البريد الإلكتروني",
    "account.role": "الدور",
    "account.company": "الشركة",
    "account.companyUnavailable": "تعذر تحميل الشركة",
    "account.noCompany": "لا توجد شركة مرتبطة",
    "account.passwordTitle": "تغيير كلمة المرور",
    "account.passwordDescription": "بعد التغيير سيتم تسجيل خروجك من هذا الجهاز وجميع الأجهزة الأخرى.",
    "account.currentPassword": "كلمة المرور الحالية",
    "account.newPassword": "كلمة المرور الجديدة",
    "account.confirmNewPassword": "تأكيد كلمة المرور الجديدة",
    "account.showPassword": "إظهار كلمة المرور",
    "account.hidePassword": "إخفاء كلمة المرور",
    "account.currentPasswordRequired": "أدخل كلمة المرور الحالية.",
    "account.passwordRequirements": "يجب أن تتوافق كلمة المرور مع سياسة القوة المطلوبة.",
    "account.passwordMismatch": "تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.",
    "account.passwordReuseError": "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.",
    "account.currentPasswordIncorrect": "كلمة المرور الحالية غير صحيحة.",
    "account.passwordChangeSuccess": "تم تغيير كلمة المرور. جارٍ تسجيل الخروج.",
    "account.passwordChangeError": "تعذر تغيير كلمة المرور. حاول مرة أخرى.",
    "account.changePassword": "تغيير كلمة المرور",
    "account.loggingOut": "جارٍ تسجيل الخروج…",
    "account.emailTitle": "تغيير البريد الإلكتروني",
    "account.emailDescription": "سيتم تسجيل خروجك من جميع الجلسات بعد تغيير البريد.",
    "account.newEmail": "البريد الإلكتروني الجديد",
    "account.confirmEmail": "تأكيد البريد الإلكتروني",
    "account.emailMismatch": "البريد الإلكتروني غير متطابق",
    "account.changeEmail": "تغيير البريد الإلكتروني",
    "account.emailChangeSuccess": "تم تغيير البريد الإلكتروني. جارٍ تسجيل الخروج…",
    "account.emailChangeError": "تعذر تغيير البريد الإلكتروني.",
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
    "newCustomer.title":"عميل جديد","newCustomer.subtitle":"حلّل موقع عميل جديد أو امسح قطاعًا كاملًا لاكتشاف مناطق التوسع.","newCustomer.pointTab":"عميل واحد (موقع محدد)","newCustomer.territoryTab":"قطاع كامل (اكتشاف مناطق التوسع)","newCustomer.gpsUnsupported":"المتصفح لا يدعم تحديد الموقع","newCustomer.locationFound":"تم تحديد الموقع","newCustomer.locationError":"تعذر الوصول إلى الموقع — حدده على الخريطة أو أدخله يدويًا","newCustomer.invalidCoordinates":"إحداثيات غير صحيحة","newCustomer.analysisComplete":"تم التحليل — {customers} عميل مرجعي، {products} صنف","newCustomer.analysisError":"تعذر إتمام التحليل","newCustomer.talkingPointsError":"تعذر توليد نقاط الحديث","newCustomer.stepLocation":"الموقع","newCustomer.stepCustomers":"العملاء والتحليل","newCustomer.step1Title":"الخطوة 1 — موقع العميل","newCustomer.gpsTab":"الموقع (GPS)","newCustomer.mapTab":"تحديد على الخريطة","newCustomer.manualTab":"إدخال يدوي","newCustomer.useCurrentLocation":"حدد موقعي الحالي","newCustomer.mapHint":"اضغط على الخريطة أو اسحب العلامة لتحديد موقع العميل بدقة.","newCustomer.latitude":"خط العرض","newCustomer.longitude":"خط الطول","newCustomer.useCoordinates":"استخدم هذه الإحداثيات","newCustomer.selectedLocation":"الموقع المحدد:","newCustomer.nextCustomers":"التالي — تحديد العملاء","newCustomer.step2Title":"الخطوة 2 — تحديد العملاء المرجعيين والتحليل","newCustomer.backToLocation":"رجوع لتعديل الموقع","newCustomer.referenceMethod":"طريقة تحديد العملاء المرجعيين","newCustomer.automatic":"تلقائي (أقرب عملاء)","newCustomer.manual":"يدوي (بحث واختيار)","newCustomer.both":"الاثنين معًا","newCustomer.nearestCustomers":"عدد أقرب العملاء","newCustomer.automaticNearestCustomers":"عدد أقرب العملاء تلقائيًا","newCustomer.runAnalysis":"نفّذ التحليل","newCustomer.result":"النتيجة","newCustomer.referenceCustomers":"عملاء مرجعيون","newCustomer.products":"أصناف","newCustomer.excludedInvalidCoordinates":"صف تم تجاهله (إحداثيات غير صالحة)","newCustomer.referenceCustomersMap":"العملاء المرجعيون على الخريطة","newCustomer.topProductAssortment":"أفضل تشكيلة أصناف","newCustomer.product":"الصنف","newCustomer.category":"التصنيف","newCustomer.totalQuantity":"إجمالي الكمية","newCustomer.totalValue":"إجمالي القيمة","newCustomer.customerCount":"عدد العملاء","newCustomer.talkingPointsTitle":"نقاط حديث بالذكاء الاصطناعي (اختياري)","newCustomer.talkingPointsHint":"يحلل الذكاء الاصطناعي أفضل تشكيلة الأصناف ويكتب للمندوب ملخصًا قصيرًا ونقاط حديث عملية جاهزة للاستخدام مع العميل الجديد.","newCustomer.areaLabel":"اسم المنطقة (اختياري — لسياق أفضل)","newCustomer.areaPlaceholder":"مثال: جدة جنوب","newCustomer.generateTalkingPoints":"ولّد نقاط حديث بالذكاء الاصطناعي","newCustomer.expansionComplete":"{count} منطقة مرشحة للتوسع","newCustomer.expansionError":"تعذر تنفيذ التحليل","newCustomer.territoryTitle":"مسح قطاع — اكتشاف مناطق التوسع","newCustomer.territoryHint":"يقسم القطاع إلى خلايا ويمنح كل مساحة بلا عملاء درجة فرصة بحسب العملاء والمبيعات القريبة منها.","newCustomer.scopeField":"عمود النطاق (اختياري — قطاع/منطقة)","newCustomer.noneOptional":"بلا (اختياري)","newCustomer.scopeValue":"قيمة النطاق","newCustomer.loading":"جارٍ التحميل…","newCustomer.all":"الكل","newCustomer.gridSize":"حجم الخلية (كم)","newCustomer.runScan":"نفّذ المسح","newCustomer.candidateAreas":"منطقة مرشحة","newCustomer.searchCustomers":"دور بالاسم أو الكود…","newCustomer.noResults":"مفيش نتائج","newCustomer.selectedCustomers":"عميل محدد","newCustomer.scopeRoute":"الخط","newCustomer.scopeCity":"المدينة","newCustomer.scopeCustomerClass":"فئة العميل","newCustomer.scopeChannel":"القناة",
    "newCustomer.km":"كم",
    "routePlanning.__reserved": "",
    "visitEfficiency.__reserved": "",
    "visitEfficiency.title": "كفاءة الزيارات", "visitEfficiency.subtitle": "يقيس المسافة بين الزيارات المتتالية للمندوب في اليوم نفسه لاكتشاف المسارات غير الفعالة.", "visitEfficiency.settings": "الإعدادات", "visitEfficiency.scopeField": "نطاق التصفية (اختياري)", "visitEfficiency.scopeRoute": "الخط (Route)", "visitEfficiency.scopeCity": "المدينة", "visitEfficiency.scopeCustomerClass": "فئة العميل", "visitEfficiency.scopeChannel": "القناة", "visitEfficiency.noFilter": "بدون تصفية", "visitEfficiency.scopeValues": "قيم النطاق (اختياري — اتركه فارغًا لكل البيانات)", "visitEfficiency.selectAll": "تحديد الكل", "visitEfficiency.clearAll": "إلغاء الكل", "visitEfficiency.loading": "جارٍ التحميل…", "visitEfficiency.noScopeValues": "لا توجد قيم في هذا العمود", "visitEfficiency.selectedValues": "{count} قيمة محددة", "visitEfficiency.fromDate": "من تاريخ (اختياري)", "visitEfficiency.toDate": "إلى تاريخ (اختياري)", "visitEfficiency.analyze": "حلل الآن", "visitEfficiency.analyzing": "جارٍ التحليل…", "visitEfficiency.analysisComplete": "{visits} زيارة عبر {reps} مندوبين", "visitEfficiency.analysisError": "تعذر تنفيذ التحليل", "visitEfficiency.result": "النتيجة", "visitEfficiency.visits": "{count} زيارة", "visitEfficiency.excludedSingleVisitDays": "{count} يوم بزيارة واحدة (متجاهل)", "visitEfficiency.excludedNoCoordinates": "{count} زيارة بدون إحداثيات صالحة", "visitEfficiency.rowOrder": "الترتيب بترتيب الصفوف (بدون وقت تسجيل دخول)", "visitEfficiency.exportExcel": "تصدير Excel", "visitEfficiency.noMapPoints": "لا توجد مواقع لعرضها على الخريطة بهذه البيانات.", "visitEfficiency.noMapPointsHint": "قد تكون لكل مندوب زيارة واحدة فقط في اليوم، أو أن الإحداثيات مفقودة أو غير صالحة.", "visitEfficiency.visibleReps": "المندوبون الظاهرون على الخريطة: {summary}", "visitEfficiency.all": "الكل", "visitEfficiency.selectedOf": "{selected} من {total}", "visitEfficiency.rep": "المندوب", "visitEfficiency.visitDays": "أيام الزيارة", "visitEfficiency.visitCount": "عدد الزيارات", "visitEfficiency.totalDistance": "إجمالي المسافة (كم)", "visitEfficiency.avgDistance": "متوسط/زيارة (كم)", "visitEfficiency.noRepVisits": "لا توجد زيارات بإحداثيات صالحة لهذا المندوب.", "visitEfficiency.date": "التاريخ", "visitEfficiency.customer": "العميل", "visitEfficiency.distanceFromPrevious": "المسافة من الزيارة السابقة (كم)", "visitEfficiency.total": "الإجمالي", "visitEfficiency.exportSummarySheet": "ملخص المندوبين", "visitEfficiency.exportDetailsSheet": "تفاصيل الزيارات", "visitEfficiency.exportFileName": "كفاءة-الزيارات.xlsx",
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
    "teamPerformance.exportExecutiveButton": "تصدير العرض التنفيذي",
    "teamPerformance.exportExecutiveSuccess": "تم إنشاء عرض تنفيذي من {count} شرائح.",
    "teamPerformance.exportExecutiveError": "تعذر إنشاء العرض التنفيذي.",
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
    "teamPerformance.supervisor": "المشرف", "teamPerformance.allSupervisors": "كل المشرفين", "teamPerformance.salesRep": "مندوب المبيعات", "teamPerformance.allSalesReps": "كل المناديب", "teamPerformance.comparisonFrom": "من تاريخ المقارنة", "teamPerformance.comparisonTo": "إلى تاريخ المقارنة", "teamPerformance.clearComparison": "إلغاء مقارنة الفترة", "teamPerformance.focusMode": "وضع التركيز", "teamPerformance.compareMode": "وضع المقارنة", "teamPerformance.showAdditionalTargets": "إظهار الأهداف الإضافية", "teamPerformance.hideAdditionalTargets": "إخفاء الأهداف الإضافية", "teamPerformance.compareGrowth": "معدلات النمو", "teamPerformance.compareTargets": "الأداء مقابل الهدف", "teamPerformance.compareAdditionalTargets": "الأهداف الإضافية", "teamPerformance.selectEntities": "اختر كيانين أو أكثر من نفس المستوى للمقارنة.", "teamPerformance.salesAchievement": "تحقيق المبيعات", "teamPerformance.diagnosis": "التشخيص", "teamPerformance.close": "إغلاق", "teamPerformance.targetInsight": "اضغط لمعرفة سبب التقدم أو التأخر",
    "teamPerformance.diagnosisSummaryPositive": "إشارة أداء إيجابية في النطاق المحدد.", "teamPerformance.diagnosisSummaryNegative": "إشارة أداء تحتاج تدخلاً في النطاق المحدد.", "teamPerformance.diagnosisEvidence": "الأدلة", "teamPerformance.diagnosisCause": "السبب المحتمل", "teamPerformance.diagnosisUnknown": "ما لا يمكن إثباته", "teamPerformance.diagnosisConfidence": "درجة الثقة", "teamPerformance.diagnosisAction": "القرار التنفيذي", "teamPerformance.diagnosisEntities": "الكيانات الأكثر تأثيرًا",
    "teamPerformance.mediumConfidence": "متوسطة",
    "copilot.title": "مساعد الزيارات",
    "copilot.subtitle": "خطة يومك وزياراتك — كل حاجة تحتاجها قبل ما تدخل للعميل.",
    "copilot.periodLabel": "الفترة",
    "copilot.period1m": "آخر شهر",
    "copilot.period3m": "آخر 3 أشهر",
    "copilot.period6m": "آخر 6 أشهر",
    "copilot.period12m": "آخر 12 شهر",
    "copilot.periodCustom": "فترة مخصصة",
    "copilot.planDateLabel": "تاريخ الخطة",
    "copilot.planDateToday": "اليوم",
    "copilot.planningModeBadge": "وضع تخطيط مسبق",
    "copilot.planningModeNotice": "بتتصفح خطة يوم لسه ماجاش — الأرقام والعملاء دول متوقعون بناءً على نمط الزيارة الأسبوعي، ومش هتقدر تبدأ أو تسجّل زيارة فعلية لحد ما ييجي اليوم ده.",
    "copilot.executionModeBadge": "وضع تنفيذ اليوم",
    "copilot.startVisitBlockedFuture": "التاريخ ده لسه ماجاش — التحضير والتحليل متاحين، لكن مينفعش تبدأ أو تسجّل زيارة فعلية.",
    "copilot.noCustomersForDate": "مفيش عملاء بيتزاروا عادةً يوم {weekday} حسب نمط الزيارة الأسبوعي.",
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
    "copilot.collectedLabel": "التحصيلات",
    "copilot.trendLabel": "الاتجاه",
    "copilot.customer360SoldProducts": "الأصناف المباعة",
    "copilot.customer360StoppedProducts": "الأصناف المتوقفة",
    "copilot.customer360SalesRank": "ترتيب المبيعات",
    "copilot.customer360SalesRankValue": "المرتبة {rank} من {total}",
    "copilot.customer360SoldProductsPeriod": "الأصناف المباعة خلال الفترة",
    "copilot.customer360StoppedProductsPeriod": "الأصناف التي توقفت خلال الفترة",
    "copilot.customer360ExpandAll": "توسيع الكل",
    "copilot.customer360CollapseAll": "طي الكل",
    "copilot.customer360NoProducts": "لا توجد أصناف مطابقة للفترة.",
    "copilot.customer360Uncategorized": "غير مصنف",
    "copilot.customer360Quantity": "الكمية",
    "copilot.customer360PreviousQuantity": "كمية الفترة السابقة",
    "copilot.customer360LastPurchase": "آخر شراء",
    "copilot.customer360StoppedStatus": "الحالة: متوقف في الفترة الأخيرة",
    "copilot.customer360DataUnavailable": "البيانات غير متاحة",
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
    "copilot.summary360Button": "ملخص اليوم 360°",
    "copilot.summary360Title": "ملخص اليوم 360°",
    "copilot.summary360Loading": "بنجهّز ملخص اليوم…",
    "copilot.summary360Error": "معرفناش نجيب ملخص اليوم",
    "copilot.summary360Retry": "حاول تاني",
    "copilot.summary360Empty": "لا توجد بيانات كافية لعرض الملخص حاليًا.",
    "copilot.summary360ScopeLine": "{scope} — {role} {user} — {from} إلى {to}",
    "copilot.summary360ExecutiveSummary": "الملخص التنفيذي",
    "copilot.summary360TopIssue": "أهم مشكلة اليوم",
    "copilot.summary360Goal": "الهدف الشهري",
    "copilot.summary360GoalTarget": "الهدف",
    "copilot.summary360GoalActual": "المحقق",
    "copilot.summary360GoalRemaining": "المتبقي",
    "copilot.summary360NoGoal": "لا يوجد هدف محدد لنطاقك",
    "copilot.summary360LostOpportunities": "الفرص الضائعة",
    "copilot.summary360NoLostOpportunities": "لا توجد فرص ضائعة وفق المعيار الحالي",
    "copilot.summary360NoCustomers": "لا يوجد عملاء مخططون للتاريخ المختار",
    "copilot.summary360NoBaselineSales": "لا توجد مبيعات مرجعية كافية لحساب الفرص",
    "copilot.summary360DataUnavailable": "تعذر حساب الفرص لعدم توفر البيانات المطلوبة",
    "copilot.summary360BaselineQuantity": "مبيعات 90 يومًا: {value}",
    "copilot.summary360RecentQuantity": "آخر 30 يومًا: {value}",
    "copilot.summary360SuggestedQuantity": "الكمية المقترحة: {value}",
    "copilot.summary360DeclineValue": "قيمة التراجع: {value}",
    "copilot.summary360DeclineQuantity": "كمية التراجع: {value}",
    "copilot.summary360BeforeAfter": "قبل: {before} ← بعد: {after}",
    "copilot.summary360LastVisit": "آخر زيارة: {date}",
    "copilot.summary360LastVisitUnknown": "آخر زيارة: غير معروفة",
    "copilot.summary360StoppedProducts": "الأصناف المتوقفة",
    "copilot.summary360Diagnosis": "التشخيص",
    "copilot.summary360VisitDecision": "إجراء الزيارة",
    "copilot.summary360LikelyReason": "السبب المرجح",
    "copilot.summary360VisitGoal": "هدف الزيارة",
    "copilot.summary360MoreProducts": "+ {count} صنف آخر",
    "copilot.summary360Uncategorized": "غير مصنف",
    "copilot.summary360OpportunityCount": "الفرص: {value}",
    "copilot.summary360ProductCount": "الأصناف: {value}",
    "copilot.summary360TotalSuggestedQuantity": "إجمالي الكمية المقترحة: {value}",
    "copilot.summary360TotalDecline": "إجمالي كمية التراجع: {value}",
    "copilot.summary360ExcludeReason": "سبب الاستبعاد (اختياري)",
    "copilot.summary360ExcludedProducts": "الأصناف المستبعدة",
    "copilot.summary360RevokeExclusion": "إلغاء الاستبعاد",
    "copilot.summary360ExclusionRevoked": "تم إلغاء الاستبعاد",
    "copilot.summary360ScopeCUSTOMER_PRODUCT": "رفض العميل للصنف",
    "copilot.summary360ScopeSALESPERSON_PRODUCT": "استبعاد المندوب",
    "copilot.summary360ScopeTEAM_PRODUCT": "استبعاد الفريق",
    "copilot.summary360ScopeCOMPANY_PRODUCT": "استبعاد الشركة",
    "copilot.summary360ExcludeMenu": "إخفاء الصنف",
    "copilot.summary360ExcludeCustomerProduct": "العميل يرفض الصنف",
    "copilot.summary360ExcludeSalespersonProduct": "إخفاؤه عني",
    "copilot.summary360ExcludeTeamProduct": "إلغاؤه لفريقي",
    "copilot.summary360ExcludeCompanyProduct": "إلغاؤه من الشركة",
    "copilot.summary360ExcludeConfirm": "هل تريد تطبيق: {scope}؟",
    "copilot.summary360ExclusionSaved": "تم إخفاء الصنف من الفرص الضائعة",
    "copilot.summary360ExclusionError": "تعذر حفظ استبعاد الصنف",
    "copilot.summary360Collections": "التحصيل",
    "copilot.summary360Collected": "تم تحصيله",
    "copilot.summary360Pending": "معلّق",
    "copilot.summary360Bounced": "مرتجع",
    "copilot.summary360PriorityDebtors": "عملاء أولوية التحصيل",
    "copilot.summary360Returns": "المرتجعات",
    "copilot.summary360ReturnsTotal": "إجمالي المرتجعات",
    "copilot.summary360ReturnsRate": "نسبة المرتجعات من المبيعات",
    "copilot.summary360NoReturns": "لا توجد مرتجعات مسجّلة لعملاء اليوم في هذه الفترة",
    "copilot.summary360InterventionNeeded": "يحتاجون تدخل",
    "copilot.summary360RootCauses": "الأسباب الجذرية المحتملة",
    "copilot.summary360ExecutiveDecision": "القرار التنفيذي",
    "copilot.summary360ExecutionPlan": "خطة التنفيذ",
    "copilot.summary360PlanPriority": "الأولوية",
    "copilot.summary360PlanAction": "الإجراء",
    "copilot.summary360PlanOwner": "المسؤول",
    "copilot.summary360PlanMetric": "مقياس النجاح",
    "copilot.summary360ClosingPhrase": "الميدان هو مصدر الحقيقة",
    "copilot.summary360AiSourced": "تمت صياغة النص بمساعدة الذكاء الاصطناعي بناءً على أرقام حقيقية",
    "copilot.summary360TemplateSourced": "تم إنشاء التقرير من قالب ثابت",
    "copilot.summary360ExportPdf": "تصدير PDF",
    "copilot.summary360ExportingPdf": "بيتم التصدير…",
    "copilot.summary360ExportError": "معرفناش نصدّر ملف PDF",
    "copilot.summary360Close": "إغلاق",
    "copilot.summary360ReportScope": "نطاق التقرير", "copilot.summary360ScopeLabel": "النطاق:", "copilot.summary360ReportDate": "التاريخ:", "copilot.summary360ComparisonPeriod": "الفترة المقارنة:",
    "copilot.prospectVisitAdded": "تمت إضافة الزيارة.", "copilot.prospectVisitError": "تعذر جدولة الزيارة.", "copilot.businessHotels": "الفنادق", "copilot.businessRestaurants": "المطاعم", "copilot.businessCafes": "المقاهي", "copilot.businessOther": "أخرى", "copilot.minProspectScore": "أدنى درجة للفرصة", "copilot.sortProspectScore": "ترتيب: درجة الفرصة", "copilot.sortCatalogFit": "ترتيب: توافق المنتجات", "copilot.collapseAll": "طي الكل", "copilot.expandAll": "توسيع الكل", "copilot.photoAttribution": "الصورة: {attribution}", "copilot.businessTypeUnavailable": "نوع النشاط غير متاح", "copilot.prospectScore": "درجة الفرصة: {value}/100", "copilot.analysisConfidence": "ثقة التحليل: {value}%", "copilot.catalogFit": "توافق منتجات الشركة: {value}", "copilot.notCalculated": "غير محسوب بعد", "copilot.topSellingNearby": "الأصناف الأكثر نجاحًا حول العميل", "copilot.soldToNearbyCustomers": "— يباع لدى {count} عميل قريب", "copilot.notEnoughLocalSalesData": "بيانات المنطقة غير كافية لاقتراح أصناف", "copilot.basedOnNearbyCustomers": "مبني على مبيعات {count} عميل قريب من نفس المنطقة", "copilot.salesOpportunity": "فرصة البيع", "copilot.addressUnavailable": "العنوان غير متاح", "copilot.dataSource": "مصدر البيانات: {source}", "copilot.whyThisProspect": "لماذا هذا العميل؟ {reason}", "copilot.directions": "الاتجاهات", "copilot.call": "اتصال", "copilot.hideDetails": "إخفاء التفاصيل", "copilot.details": "التفاصيل", "copilot.addToday": "أضف اليوم", "copilot.scheduleLater": "جدولة لاحقًا",
    "nav.smartLoading": "التحميل الذكي",
    "smartLoading.title": "التحميل الذكي",
    "smartLoading.subtitle": "تجهيز المركبة قبل بدء خط السير.",
    "smartLoading.summaryTitle": "ملخص التحميل",
    "smartLoading.summaryDescription": "نظرة تشغيلية سريعة قبل الانطلاق.",
    "smartLoading.productsToLoad": "أصناف للتحميل",
    "smartLoading.totalQuantity": "إجمالي الكمية",
    "smartLoading.priorityProducts": "أصناف أولوية",
    "smartLoading.operationalPriorityProducts": "أصناف ذات أولوية تشغيلية",
    "smartLoading.noOperationalPriority": "لا توجد أولوية تشغيلية محددة حاليًا.",
    "smartLoading.operationalPriorityProductsPanelTitle": "أصناف ذات أولوية تشغيلية",
    "smartLoading.lastCalculation": "آخر حساب",
    "smartLoading.preliminaryStockNotice": "رصيد السيارة غير متوفر. الكميات المعروضة احتياج مبدئي قبل خصم المخزون الحالي.",
    "smartLoading.preliminaryNeed": "احتياج مبدئي",
    "smartLoading.manualVehicleStock": "رصيد السيارة",
    "smartLoading.manualVehicleStockHint": "أدخل الرصيد المتاح لتحويل الاحتياج المبدئي إلى توصية نهائية.",
    "smartLoading.targetDate": "تجهيز تحميل ليوم",
    "smartLoading.routeCustomers": "عملاء خط السير",
    "smartLoading.noRouteForDate": "لا يوجد خط سير محدد لهذا اليوم.",
    "smartLoading.noRoutePriority": "لا توجد أصناف ذات أولوية لمسار هذا اليوم.",
    "smartLoading.changeDateConfirm": "سيؤدي تغيير يوم التحميل إلى إلغاء التعديلات المحلية. هل تريد المتابعة؟",
    "smartLoading.attentionTitle": "انتباه اليوم",
    "smartLoading.attentionDescription": "حقائق تشغيلية تستحق المراجعة.",
    "smartLoading.recommendationsTitle": "توصيات التحميل",
    "smartLoading.recommendationsDescription": "تظهر فقط الكميات الإضافية المقترحة.",
    "smartLoading.suggestedLoading": "الكمية المقترحة",
    "smartLoading.showReason": "عرض سبب الكمية",
    "smartLoading.vehicleStock": "مخزون السيارة",
    "smartLoading.weeklyAverage": "المتوسط الأسبوعي",
    "smartLoading.confirmedOrders": "طلبات مؤكدة",
    "smartLoading.confirmedOrdersHint": "تُحدد هذه الكمية بواسطة المندوب أو المشرف بناءً على الطلبات المؤكدة من العملاء.",
    "smartLoading.safetyStock": "مخزون الأمان",
    "smartLoading.safetyStockHint": "يُحدد مخزون الأمان بواسطة المندوب أو المشرف وفق قوة حركة الصنف وظروف خط السير.",
    "smartLoading.empty": "لا توجد توصيات تحميل إضافية حاليًا.",
    "smartLoading.error": "تعذر حساب توصيات التحميل.",
    "smartLoading.retry": "إعادة المحاولة",
    "smartLoading.vehicleStockUnavailable": "مخزون السيارة غير متوفر حاليًا.",
    "smartLoading.vehicleStockUnavailableHint": "لا يمكن إنشاء توصيات تحميل قبل توفر رصيد السيارة للمسار المحدد تلقائيًا.",
    "smartLoading.checklistTitle": "قائمة المراجعة قبل الانطلاق",
    "smartLoading.checklistDescription": "مراجعة تنفيذية لا تغيّر قرار التحميل.",
    "smartLoading.checklist.quantities": "مراجعة كميات التحميل",
    "smartLoading.checklist.priority": "تحميل أصناف الأولوية",
    "smartLoading.checklist.cartons": "فحص الكراتين",
    "smartLoading.checklist.verified": "التحقق من الكميات",
    "smartLoading.checklist.organized": "تنظيم الأصناف داخل السيارة",
    "smartLoading.checklist.approved": "اعتماد التحميل",
    "smartLoading.startRoute": "بدء خط السير",
    "smartLoading.refresh": "تحديث",
    "smartLoading.noOtherAlerts": "لا توجد تنبيهات إضافية.",
    "smartLoading.staleProducts": "أصناف راكدة",
    "smartLoading.staleProductsPage": "الأصناف الراكدة",
    "smartLoading.staleProductsPlanTitle": "خطة تصريف الأصناف الراكدة",
    "smartLoading.staleProductsLoading": "جارٍ تحميل الأصناف الراكدة...",
    "smartLoading.staleProductsError": "تعذر تحميل بيانات الأصناف الراكدة.",
    "smartLoading.noStaleProducts": "لا توجد أصناف راكدة ضمن فترة الركود المحددة.",
    "smartLoading.selectStaleProduct": "اختر صنفًا لعرض العملاء الذين اشتروا الصنف فعليًا.",
    "smartLoading.noPurchasingCustomers": "لا توجد مشتريات فعلية مسجلة لهذا الصنف ضمن نطاقك.",
    "smartLoading.customer": "العميل",
    "smartLoading.totalPurchasedQuantity": "إجمالي الكمية المشتراة",
    "smartLoading.purchaseFrequency": "عدد مرات الشراء",
    "smartLoading.lastPurchaseDate": "آخر تاريخ شراء",
    "smartLoading.daysStale": "أيام الركود",
    "smartLoading.productLabel": "الصنف",
    "smartLoading.openAllSections": "فتح كل الأقسام",
    "smartLoading.closeAllSections": "إغلاق كل الأقسام",
    "smartLoading.practicalDecision": "القرار العملي",
    "smartLoading.customerEvidence": "دليل العملاء: {count} عميل",
    "smartLoading.staleProductsPanelTitle": "أصناف راكدة",
    "smartLoading.priorityProductsPanelTitle": "أصناف أولوية",
    "smartLoading.close": "إغلاق",
    "smartLoading.uncategorized": "غير مصنف",
    "smartLoading.restore": "استعادة",
    "smartLoading.manualOverrideNote": "تم تعديل الكمية يدويًا (الأصل: {value})",
    "smartLoading.quantityUnit": "صنف",
    "smartLoading.lastSale": "آخر بيع",
    "smartLoading.staleDaysUnit": "يوم",
    "smartLoading.noStaleSalesOverThreshold": "لا توجد أصناف تجاوز آخر بيع لها 4 أيام.",
    "smartLoading.missingLastSaleData": "{count} صنفًا لا تتوفر له بيانات آخر بيع.",
    "smartLoading.salesDataDetails": "تفاصيل بيانات آخر بيع",
    "smartLoading.productsWithRecentSales": "أصناف ذات بيع حديث",
    "smartLoading.productsWithStaleSales": "أصناف راكدة",
    "smartLoading.productsWithoutLastSaleDate": "أصناف بلا تاريخ آخر بيع",
    "smartLoading.exportExcel": "Excel",
    "smartLoading.exportOds": "ODS",
    "smartLoading.exportColumnProduct": "الصنف",
    "smartLoading.exportColumnCategory": "القسم",
    "smartLoading.export": "تصدير",
    "smartLoading.refreshing": "جارٍ التحديث",
    "smartLoading.refreshFailed": "تعذر تحديث بيانات التحميل. حاول مرة أخرى.",
    "smartLoading.exportColumnSource": "نوع الإضافة",
    "smartLoading.addedManually": "مضاف يدويًا",
    "smartLoading.recommended": "مقترح",
    "smartLoading.addProduct": "إضافة صنف",
    "smartLoading.addProductDescription": "ابحث ضمن أصناف الجلسة وحدد كمية تحميل موجبة.",
    "smartLoading.searchProducts": "بحث عن الأصناف",
    "smartLoading.noProductsFound": "لا توجد أصناف مطابقة",
    "smartLoading.manualQuantity": "كمية التحميل",
    "smartLoading.removeProduct": "إزالة الصنف",
    "smartLoading.restoreOriginalList": "استعادة القائمة الأصلية",
    "smartLoading.alertsTitle": "تنبيهات اليوم",
    "smartLoading.lostOpportunities": "\u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629",
    "smartLoading.lostOpportunitiesDescription": "\u0641\u0631\u0635 \u0639\u0645\u0644\u0627\u0621 \u062e\u0637 \u0633\u064a\u0631 \u0627\u0644\u063a\u062f \u062d\u0633\u0628 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0645\u0646\u062a\u062c.",
    "smartLoading.lostOpportunityCategories": "\u0627\u0644\u0623\u0642\u0633\u0627\u0645",
    "smartLoading.lostOpportunityProducts": "\u0627\u0644\u0623\u0635\u0646\u0627\u0641",
    "smartLoading.lostOpportunityCustomers": "\u0641\u0631\u0635 \u0627\u0644\u0639\u0645\u0644\u0627\u0621",
    "smartLoading.searchLostOpportunities": "\u0627\u0628\u062d\u062b \u0628\u0627\u0644\u0642\u0633\u0645 \u0623\u0648 \u0627\u0644\u0635\u0646\u0641 \u0623\u0648 \u0627\u0644\u0643\u0648\u062f \u0623\u0648 \u0627\u0644\u0639\u0645\u064a\u0644",
    "smartLoading.lostOpportunitiesError": "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0636\u0627\u0626\u0639\u0629. \u062d\u0627\u0648\u0644 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0634\u0627\u0634\u0629.",
    "smartLoading.noLostOpportunities": "\u0644\u0627 \u062a\u0648\u062c\u062f \u0641\u0631\u0635 \u0636\u0627\u0626\u0639\u0629 \u0645\u0637\u0627\u0628\u0642\u0629.",
    "smartLoading.categoryTotal": "\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0643\u0645\u064a\u0629: {value}",
    "smartLoading.categoryPartiallyAdded": "\u062a\u0645\u062a \u0625\u0636\u0627\u0641\u0629 {added} \u0645\u0646 {total} \u0623\u0635\u0646\u0627\u0641",
    "smartLoading.productSuggestedQuantity": "\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629: {value}",
    "smartLoading.customerSuggestedQuantity": "\u0627\u0644\u0643\u0645\u064a\u0629 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629 \u0644\u0644\u0639\u0645\u064a\u0644 {customer}",
    "smartLoading.addCategory": "\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0642\u0633\u0645",
    "smartLoading.addToLoading": "\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0627\u0644\u062a\u062d\u0645\u064a\u0644",
    "smartLoading.added": "\u062a\u0645\u062a \u0627\u0644\u0625\u0636\u0627\u0641\u0629",
    "smartLoading.vehicleStockQuantity": "\u0645\u062e\u0632\u0648\u0646 \u0627\u0644\u0633\u064a\u0627\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a: {value}",
    "smartLoading.reviewCapacity": "\u0631\u0627\u062c\u0639 \u0627\u0644\u0633\u0639\u0629 \u0642\u0628\u0644 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062d\u0645\u064a\u0644.",
    "smartLoading.pdfExportedAt": "وقت التصدير",
    "smartLoading.toDate": "إلى تاريخ",
    "smartLoading.noRecommendations": "لا توجد توصيات لهذه الفترة.",
    "smartLoading.awaitingCalculation": "اختر العملاء لاحتساب التوصيات.",
    "smartLoading.selectProduct": "اختر صنفًا",
    "smartLoading.onceWeekly": "مرة أسبوعيًا",
    "smartLoading.invalidDateRange": "يجب أن يكون تاريخ البداية في أو قبل تاريخ النهاية.",
    "smartLoading.noCustomersFound": "لا توجد نتائج للعملاء",
    "smartLoading.calendarDays": "عدد الأيام التقويمية",
    "smartLoading.visitsPerWeek": "نمط زيارات خط السير",
    "smartLoading.add": "إضافة",
    "smartLoading.estimatedSuggestedQuantity": "الكمية المقترحة التقديرية",
    "smartLoading.editRoute": "تعديل خط السير",
    "smartLoading.exceptionalCustomer": "مضاف استثنائيًا",
    "smartLoading.sessionSummary": "ملخص الجلسة",
    "smartLoading.applyAndClose": "تطبيق وإغلاق",
    "smartLoading.exceptionalCustomers": "مضاف استثنائيًا",
    "smartLoading.noConfirmedOrders": "لا توجد طلبيات مؤكدة مضافة.",
    "smartLoading.visitCustomers": "عملاء الزيارة",
    "smartLoading.selectedCustomers": "المحددون",
    "smartLoading.estimatedDemand": "احتياج العملاء التقديري",
    "smartLoading.aggregatedConfirmedOrders": "الطلبات المؤكدة المجمعة",
    "smartLoading.visitsHint": "تُستخدم هذه القيمة لحساب كمية تقديرية لكل زيارة.",
    "smartLoading.routeSetup": "إعداد خط السير",
    "smartLoading.twiceWeekly": "مرتان أسبوعيًا",
    "smartLoading.orderTotals": "إجمالي الأصناف",
    "smartLoading.searchCustomers": "البحث عن العملاء",
    "smartLoading.sixWeekly": "6 مرات أسبوعيًا",
    "smartLoading.fromDate": "من تاريخ",
    "smartLoading.noSelectedCustomers": "حدد عميلاً واحدًا على الأقل قبل الحساب.",
    "smartLoading.currentRecommendations": "توصيات التحميل الحالية",
    "smartLoading.remove": "حذف",
    "fsos360.company": "الشركة",
    "fsos360.region": "المنطقة",
    "fsos360.city": "المدينة",
    "fsos360.branch": "الفرع",
    "fsos360.manager": "المدير",
    "fsos360.supervisor": "المشرف",
    "fsos360.route": "خط السير",
    "fsos360.salesRep": "المندوب",
    "fsos360.customer": "العميل",
    "fsos360.brand": "العلامة التجارية",
    "fsos360.category": "الفئة",
    "fsos360.product": "المنتج",
    "fsos360.title": "FSOS 360",
    "fsos360.subtitle": "مساحة عمل تنفيذية موحّدة لفهم الأداء واتخاذ القرار.",
    "fsos360.refresh": "تحديث",
    "fsos360.filters": "الفلاتر",
    "fsos360.filtersDescription": "حدد الفترة والنطاق لتحليل البيانات.",
    "fsos360.currentPeriod": "الفترة الحالية",
    "fsos360.comparisonPeriod": "فترة المقارنة",
    "fsos360.analysisFocus": "مستوى التحليل",
    "fsos360.auto": "تلقائي",
    "fsos360.removedSelections": "تم حذف {count} من الاختيارات غير الصالحة بعد تغيير الفلاتر.",
    "fsos360.loading": "جارٍ التحميل...",
    "fsos360.error": "تعذر تحميل بيانات مساحة العمل.",
    "fsos360.executiveInsight": "الرؤية التنفيذية",
    "fsos360.noInsight": "لا توجد رؤية تنفيذية متاحة حاليًا.",
    "fsos360.kpiSummary": "ملخص المؤشرات",
    "fsos360.comparedToPrevious": "مقارنة بالفترة السابقة",
    "fsos360.performanceComparison": "مقارنة الأداء",
    "fsos360.indicator": "المؤشر",
    "fsos360.current": "الحالي",
    "fsos360.previous": "السابق",
    "fsos360.change": "التغيّر",
    "fsos360.changePercent": "نسبة التغيّر",
    "fsos360.timeline": "المسار الزمني",
    "fsos360.target": "الهدف",
    "fsos360.targetValue": "قيمة الهدف",
    "fsos360.achievement": "الإنجاز",
    "fsos360.achievementPercent": "نسبة الإنجاز",
    "fsos360.remaining": "المتبقي",
    "fsos360.visualization": "التصور المرئي",
    "fsos360.visualizationDescription": "يتغيّر نوع العرض تلقائيًا حسب سياق التحليل.",
    "fsos360.totalRows": "إجمالي السجلات: {count}",
    "fsos360.mappedRows": "المعروض على الخريطة: {count}",
    "fsos360.unmappedRows": "بدون إحداثيات: {count}",
    "fsos360.routePointsOnly": "نقاط الزيارات فقط — بيانات مسار الخط غير متاحة.",
    "fsos360.empty": "لا توجد بيانات كافية لعرض هذا التحليل.",
    "fsos360.notAvailable": "غير متاح حاليًا.",
    "fsos360.opportunities": "الفرص",
    "fsos360.recommendations": "التوصيات",
    "fsos360.search": "بحث",
    "fsos360.unavailable": "غير متاح",
    "fsos360.noResults": "لا توجد نتائج",
    "fsos360.clear": "مسح",
    "fsos360.next": "التالي",
    "fsos360.available": "متاح",
    "fsos360.partial": "متاح جزئيًا",
    "fsos360.not-applicable": "لا ينطبق",
    "fsos360.pending-business-approval": "بانتظار اعتماد قاعدة العمل",
    "fsos360.focus.company": "الشركة",
    "fsos360.focus.region": "المنطقة",
    "fsos360.focus.branch": "الفرع",
    "fsos360.focus.manager": "المدير",
    "fsos360.focus.supervisor": "المشرف",
    "fsos360.focus.route": "خط السير",
    "fsos360.focus.sales-rep": "المندوب",
    "fsos360.focus.customer": "العميل",
    "fsos360.focus.brand": "العلامة التجارية",
    "fsos360.focus.category": "الفئة",
    "fsos360.focus.product": "المنتج",
    "fsos360.kpi.sales": "المبيعات",
    "fsos360.kpi.collections": "التحصيل",
    "fsos360.kpi.returns": "المرتجعات",
    "fsos360.kpi.lost-sales": "المبيعات الضائعة",
    "fsos360.kpi.orders": "الطلبات",
    "fsos360.kpi.coverage": "التغطية",
    "fsos360.kpi.strike-rate": "نسبة الفاعلية",
    "fsos360.kpi.productivity": "الإنتاجية",
    "fsos360.kpi.sales.change": "تغيّر في المبيعات مقارنة بالفترة المرجعية.",
    "fsos360.kpi.collections.change": "تغيّر في التحصيل مقارنة بالفترة المرجعية.",
    "fsos360.kpi.returns.change": "تغيّر في المرتجعات مقارنة بالفترة المرجعية.",
    "fsos360.kpi.orders.change": "تغيّر في عدد الطلبات مقارنة بالفترة المرجعية.",
    "fsos360.kpi.coverage.change": "تغيّر في نسبة التغطية مقارنة بالفترة المرجعية.",
    "fsos360.kpi.strikeRate.change": "تغيّر في نسبة فاعلية الزيارات مقارنة بالفترة المرجعية.",
    "fsos360.kpi.productivity.change": "تغيّر في الإنتاجية مقارنة بالفترة المرجعية.",
    "fsos360.reason.customers-dataset-unavailable": "بيانات العملاء غير متاحة.",
    "fsos360.reason.products-dataset-unavailable": "بيانات المنتجات غير متاحة.",
    "fsos360.reason.pending-business-approval": "بانتظار اعتماد قاعدة العمل قبل العرض.",
    "fsos360.reason.sgi-filter-scope-not-supported": "محرك نمو المبيعات لا يدعم حاليًا نطاق هذه الفلاتر.",
    "fsos360.reason.lost-sales-aggregation-and-deduplication-unapproved": "منطق تجميع المبيعات الضائعة لم يُعتمد بعد.",
    "fsos360.reason.route-assignment-history-unavailable": "سجل تكليف خطوط السير التاريخي غير متاح لهذا التحليل.",
    "fsos360.reason.route-month-target-source": "الهدف مبني من بيانات الأهداف على مستوى خط السير والشهر.",
    "fsos360.reason.targets-dataset-unavailable": "بيانات الأهداف غير متاحة.",
    "fsos360.reason.ambiguous-analysis-focus": "مستوى التحليل غير محدد بوضوح بسبب تعدد الفلاتر النشطة.",
    "fsos360.reason.manager-supervisor-role-ambiguous": "لا يمكن حاليًا التمييز الموثوق بين المدير والمشرف.",
    "fsos360.reason.invoices-dataset-unavailable": "بيانات الفواتير غير متاحة.",
    "fsos360.reason.filter-not-supported": "هذا الفلتر غير مدعوم لهذا المؤشر.",
    "fsos360.reason.zero-denominator": "لا يمكن الحساب بسبب عدم وجود زيارات مثمرة.",
    "fsos360.reason.analysis-level-does-not-own-target": "هذا المستوى التحليلي لا يملك هدفًا مباشرًا.",
    "fsos360.reason.partial-period": "الفترة المحددة لا تغطي شهرًا كاملاً.",
    "fsos360.reason.incomplete-target-coverage": "تغطية بيانات الهدف غير مكتملة لهذا النطاق.",
    "fsos360.reason.analysis-unavailable": "التحليل غير متاح حاليًا.",
    "fsos360.reason.product-filter-not-supported-for-collections": "فلاتر المنتج غير مدعومة لمؤشر التحصيل.",
    "fsos360.reason.product-filter-not-supported-for-returns": "فلاتر المنتج غير مدعومة لمؤشر المرتجعات.",
    "fsos360.reason.product-filter-not-supported-for-visits": "فلاتر المنتج غير مدعومة لمؤشرات الزيارات.",
    "fsos360.reason.products-or-invoices-dataset-unavailable": "بيانات المنتجات أو الفواتير غير متاحة.",
    "fsos360.reason.missing-dataset": "البيانات المطلوبة غير متاحة.",
    "fsos360.visualization.timeline": "المسار الزمني",
    "fsos360.visualization.line": "خط بياني",
    "fsos360.visualization.bar": "أعمدة عمودية",
    "fsos360.visualization.treemap": "خريطة شجرية",
    "fsos360.visualization.heat-map": "خريطة حرارية",
    "fsos360.visualization.coverage-map": "خريطة التغطية",
    "fsos360.visualization.route-map": "خريطة خط السير",
    "fsos360.visualization.customer-density": "كثافة العملاء",
    "shared.error.requestFailed": "\u062a\u0639\u0630\u0631 \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0637\u0644\u0628. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    "shared.error.unauthorized": "\u0627\u0646\u062a\u0647\u062a \u0635\u0644\u0627\u062d\u064a\u0629 \u062c\u0644\u0633\u062a\u0643. \u0633\u062c\u0651\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0645\u062c\u062f\u062f\u064b\u0627.",
    "shared.error.forbidden": "\u0644\u064a\u0633 \u0644\u062f\u064a\u0643 \u0635\u0644\u0627\u062d\u064a\u0629 \u0644\u062a\u0646\u0641\u064a\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621.",
    "shared.error.notFound": "\u0627\u0644\u0639\u0646\u0635\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.",
    "shared.error.conflict": "\u0644\u0627 \u064a\u0645\u0643\u0646 \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u0628\u0633\u0628\u0628 \u062a\u0639\u0627\u0631\u0636 \u0641\u064a \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.",
    "shared.validation.invalid": "\u0631\u0627\u062c\u0639 \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0648\u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.",
    "shared.toast.copied": "\u062a\u0645 \u0627\u0644\u0646\u0633\u062e",
    "shared.tempPassword.title": "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0624\u0642\u062a\u0629 \u0644\u0640 {email}",
    "shared.tempPassword.description": "\u0627\u0646\u0633\u062e\u0647\u0627 \u0627\u0644\u0622\u0646\u061b \u062a\u0638\u0647\u0631 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u0642\u0637\u060c \u0648\u064a\u062c\u0628 \u062a\u063a\u064a\u064a\u0631\u0647\u0627 \u0639\u0646\u062f \u0623\u0648\u0644 \u062a\u0633\u062c\u064a\u0644 \u062f\u062e\u0648\u0644.",
    "shared.action.copy": "\u0646\u0633\u062e",
    "shared.action.dismiss": "\u0625\u063a\u0644\u0627\u0642",
    "admin.nav.userActivity": "\u0646\u0634\u0627\u0637 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u064a\u0646",
    "performance.title": "\u0644\u0648\u062d\u0629 \u0627\u0644\u0623\u062f\u0627\u0621 \u0648\u0627\u0644\u0646\u0645\u0648", "performance.subtitle": "\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0623\u062f\u0627\u0621 \u0627\u0644\u0641\u0639\u0644\u064a \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0645\u0642\u0627\u0631\u0646\u0629 \u0648\u0627\u0644\u0623\u0647\u062f\u0627\u0641 \u0627\u0644\u0645\u0631\u062d\u0644\u064a\u0629", "performance.loadError": "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0623\u062f\u0627\u0621. \u062d\u0627\u0648\u0644 \u0627\u0644\u062a\u062d\u062f\u064a\u062b.", "performance.sellingDays": "\u0623\u064a\u0627\u0645 \u0627\u0644\u0628\u064a\u0639", "performance.previousMonth": "\u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u0627\u0636\u064a", "performance.previousQuarter": "\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0643\u0648\u0627\u0631\u062a\u0631 \u0627\u0644\u0633\u0627\u0628\u0642", "performance.growthTitle": "\u0645\u0639\u062f\u0644\u0627\u062a \u0627\u0644\u0646\u0645\u0648 (MTD)", "performance.comparisonDays": "\u0627\u0644\u0645\u0642\u0627\u0631\u0646\u0629 \u062d\u0633\u0628 \u0623\u0648\u0644 {count} \u0623\u064a\u0627\u0645 \u0628\u064a\u0639 \u0641\u0639\u0644\u064a\u0629", "performance.againstPreviousMonth": "\u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u0627\u0636\u064a", "performance.againstPreviousQuarter": "\u0645\u0642\u0627\u0628\u0644 \u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0643\u0648\u0627\u0631\u062a\u0631 \u0627\u0644\u0633\u0627\u0628\u0642", "performance.sales": "\u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u0628\u0627\u0644\u0642\u064a\u0645\u0629", "performance.collections": "\u0627\u0644\u062a\u062d\u0635\u064a\u0644", "performance.invoices": "\u0639\u062f\u062f \u0627\u0644\u0641\u0648\u0627\u062a\u064a\u0631", "performance.customers": "\u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0634\u062a\u0631\u0648\u0646", "performance.skus": "\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0645\u0628\u0627\u0639\u0629", "performance.returns": "\u0627\u0644\u0645\u0631\u062a\u062c\u0639\u0627\u062a \u0628\u0627\u0644\u0642\u064a\u0645\u0629", "performance.noChange": "\u0644\u0627 \u062a\u063a\u064a\u064a\u0631", "performance.referencePeriod": "\u0627\u0644\u0641\u062a\u0631\u0629 \u0627\u0644\u0645\u0631\u062c\u0639\u064a\u0629", "performance.quarterAverage": "\u0645\u062a\u0648\u0633\u0637 \u0622\u062e\u0631 3 \u0623\u0634\u0647\u0631", "performance.primaryTargets": "\u0627\u0644\u0623\u062f\u0627\u0621 \u0645\u0642\u0627\u0628\u0644 \u0627\u0644\u0647\u062f\u0641 (\u062d\u062a\u0649 \u0627\u0644\u064a\u0648\u0645)", "performance.secondaryTargets": "\u0623\u0647\u062f\u0627\u0641 \u0625\u0636\u0627\u0641\u064a\u0629", "performance.monthlyTarget": "\u0627\u0644\u0647\u062f\u0641 \u0627\u0644\u0634\u0647\u0631\u064a", "performance.actual": "\u0627\u0644\u0645\u062d\u0642\u0642 \u0627\u0644\u0641\u0639\u0644\u064a", "performance.targetToDate": "\u0627\u0644\u0647\u062f\u0641 \u062d\u062a\u0649 \u0627\u0644\u064a\u0648\u0645", "performance.difference": "\u0627\u0644\u0641\u0631\u0642", "performance.achievement": "\u0646\u0633\u0628\u0629 \u0627\u0644\u0625\u0646\u062c\u0627\u0632 \u0627\u0644\u0645\u0631\u062d\u0644\u064a", "performance.remaining": "\u0627\u0644\u0645\u062a\u0628\u0642\u064a \u0645\u0646 \u0627\u0644\u0647\u062f\u0641", "performance.requiredDaily": "\u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u064a\u0648\u0645\u064a\u064b\u0627", "performance.forecast": "\u062a\u0648\u0642\u0639 \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u0634\u0647\u0631", "performance.ahead": "\u0645\u062d\u0642\u0642 / \u0645\u062a\u0642\u062f\u0645", "performance.nearPlan": "\u0642\u0631\u064a\u0628 \u0645\u0646 \u0627\u0644\u0645\u062e\u0637\u0637", "performance.behind": "\u0645\u062a\u0623\u062e\u0631 \u0639\u0646 \u0627\u0644\u0645\u0633\u0627\u0631", "performance.unavailable": "\u063a\u064a\u0631 \u0645\u062a\u0627\u062d", "subscription.title": "\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643", "subscription.plan": "\u0627\u0644\u0628\u0627\u0642\u0629", "subscription.paymentStatus": "\u062d\u0627\u0644\u0629 \u0627\u0644\u062f\u0641\u0639", "subscription.paid": "\u0645\u062f\u0641\u0648\u0639", "subscription.unpaid": "\u063a\u064a\u0631 \u0645\u062f\u0641\u0648\u0639", "subscription.trialEnds": "\u0627\u0646\u062a\u0647\u0627\u0621 \u0627\u0644\u0641\u062a\u0631\u0629 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a\u0629", "subscription.blocked": "\u0627\u0634\u062a\u0631\u0627\u0643\u0643 \u062d\u0627\u0644\u064a\u064b\u0627 {status}. \u0631\u0641\u0639 \u0627\u0644\u0645\u0644\u0641\u0627\u062a \u0648\u062a\u0634\u063a\u064a\u0644 \u0645\u0631\u0634\u062f\u0643 \u0645\u0639\u0637\u0644\u0627\u0646 \u0644\u062d\u062f \u0645\u0627 \u064a\u062a\u0645 \u062d\u0644 \u0627\u0644\u0623\u0645\u0631.",
    "performance.targetSales": "\u0647\u062f\u0641 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a", "performance.targetCollections": "\u0647\u062f\u0641 \u0627\u0644\u062a\u062d\u0635\u064a\u0644", "performance.targetWeight": "\u0647\u062f\u0641 \u0627\u0644\u0648\u0632\u0646", "performance.targetActiveCustomers": "\u0647\u062f\u0641 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0646\u0634\u0637\u064a\u0646", "performance.targetProductiveCalls": "\u0647\u062f\u0641 \u0627\u0644\u0632\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0646\u062a\u062c\u0629", "performance.targetSkuDistribution": "\u0647\u062f\u0641 \u062a\u0648\u0632\u064a\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641",
  },
  en: {
    "routePlanning.splitComplete": "Split complete — ", "routePlanning.customersAcross": " customers across ", "routePlanning.groups": " groups", "routePlanning.splitError": "Could not complete the split", "routePlanning.selectedValues": " selected values", "routePlanning.customersUsed": " customers used", "routePlanning.coverage": "Coverage: ", "routePlanning.targetAverage": "Target average: ", "routePlanning.maxDeviation": "Maximum deviation: ", "routePlanning.invalidCoordinates": " excluded rows (invalid coordinates)", "routePlanning.newRoute": "New route ", "routePlanning.groupPrefix": "Group ",
    "routePlanning.exportCustomerId": "Customer ID", "routePlanning.exportName": "Name", "routePlanning.exportLatitude": "Latitude", "routePlanning.exportLongitude": "Longitude", "routePlanning.exportBeforeRoute": "Route (before)", "routePlanning.exportAfterRoute": "Route (after)", "routePlanning.exportSheet": "Split", "routePlanning.exportFilePrefix": "route-split",
    "dashboard.refresh": "Refresh data",
    "routePlanning.title": "Route Planning", "routePlanning.subtitle": "Split a territory or route into geographically coherent, sales-balanced groups.", "routePlanning.settings": "Settings", "routePlanning.scopeField": "Scope field (rep/area)", "routePlanning.selectField": "Select a field…", "routePlanning.groupCount": "Number of groups", "routePlanning.groupCountHint": "This follows the selected value count automatically. Change it manually to consolidate routes or add a route.", "routePlanning.restoreAuto": "Restore automatic sync", "routePlanning.splitting": "Splitting…", "routePlanning.splitNow": "Split now", "routePlanning.scopeValues": "Scope values (select one or more before splitting)", "routePlanning.selectAll": "Select all", "routePlanning.clearAll": "Clear all", "routePlanning.chooseScopeFirst": "Select a scope field first", "routePlanning.loading": "Loading…", "routePlanning.noValues": "There are no values in this field", "routePlanning.result": "Result", "routePlanning.before": "Before (geographic only)", "routePlanning.after": "After (balanced)", "routePlanning.showPerformance": "Show performance", "routePlanning.export": "Export Excel", "routePlanning.routeName": "Route name", "routePlanning.customers": "Customers", "routePlanning.sales": "Sales", "routePlanning.averageCustomer": "Average/customer", "routePlanning.deviation": "Deviation", "routePlanning.performance": "Performance", "routePlanning.good": "Good", "routePlanning.average": "Average", "routePlanning.weak": "Weak", "routePlanning.scopeRoute": "Route", "routePlanning.scopeCity": "City", "routePlanning.scopeCustomerClass": "Customer class", "routePlanning.scopeChannel": "Channel", "routePlanning.group": "Group {count}",
    "visitCopilotPreview.preview": "Temporary interface preview", "visitCopilotPreview.title": "Smart Visit Copilot", "visitCopilotPreview.subtitle": "One clear decision for every visit, without extra reports or details.", "visitCopilotPreview.period": "Analysis period", "visitCopilotPreview.period1m": "Last month", "visitCopilotPreview.period3m": "Last 3 months", "visitCopilotPreview.period6m": "Last 6 months", "visitCopilotPreview.period12m": "Last 12 months", "visitCopilotPreview.periodCustom": "Custom period", "visitCopilotPreview.from": "From", "visitCopilotPreview.to": "To", "visitCopilotPreview.vanStock": "Consider van stock", "visitCopilotPreview.customDateRequired": "Set the start and end dates first.", "visitCopilotPreview.mode1": "Mode 1", "visitCopilotPreview.mode2": "Mode 2", "visitCopilotPreview.todayPlan": "Today's visit plan", "visitCopilotPreview.selectCustomer": "Select a customer to start the visit", "visitCopilotPreview.noVisits": "No visits are available today.", "visitCopilotPreview.visitMode": "Visit mode", "visitCopilotPreview.mission": "Visit mission", "visitCopilotPreview.priority": "Priority {value}", "visitCopilotPreview.missionNote": "Mission classification is a temporary preview until it is connected to the intelligence engine.", "visitCopilotPreview.recommendations": "AI recommendations", "visitCopilotPreview.geoIntelligence": "Location intelligence", "visitCopilotPreview.previewData": "Temporary preview data", "visitCopilotPreview.geoDescription": "The three best opportunities among customers close to today's route.", "visitCopilotPreview.askAi": "Ask AI",
    "analysisStudio.title": "Analysis Studio",
    "analysisStudio.subtitle": "Ask your Custom GPT as usual. When an answer includes a table, chart, or map, it will appear here too.",
    "analysisStudio.clear": "Clear view",
    "analysisStudio.unavailable": "The analysis feed is temporarily unavailable. You can continue using GPT.",
    "analysisStudio.empty": "There are no analyses here yet. Launch GPT above and ask a question to see its answer here.",
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
    "nav.reports": "Reports",
    "nav.sgi": "Growth Opportunity Center",
    "nav.territoryIntelligence": "Territory Intelligence",
    "nav.decisionAnalyticsStudio": "Decision Analytics Studio",
    "nav.fsos360": "FSOS 360",
    "nav.geoEngine": "Geo Intelligence Engine",
    "nav.visitCopilot": "Visit Copilot",
    "nav.team": "Team",
    "nav.employees": "Employees",
    "nav.settings": "Settings",
    "nav.account": "Account",
    "admin.nav.dashboard": "Dashboard",
    "admin.nav.users": "Users",
    "admin.nav.companies": "Companies",
    "admin.nav.subscriptions": "Subscriptions",
    "admin.nav.payments": "Payments",
    "admin.nav.accessControl": "Access control",
    "admin.nav.usage": "Usage statistics",
    "admin.nav.settings": "Platform settings",
    "territoryIntelligence.title": "Territory Intelligence",
    "territoryIntelligence.subtitle": "Not just a map — every territory tells you the problem, the why, and the right decision.",
    "territoryIntelligence.libraryTitle": "Intelligence Library",
    "territoryIntelligence.categoryPerformance": "ًں“ٹ Performance",
    "territoryIntelligence.categoryRisk": "âڑ ï¸ڈ Risk",
    "territoryIntelligence.categoryOpportunity": "ًں’، Opportunity",
    "territoryIntelligence.categoryTerritory": "ًں—؛ï¸ڈ Territory Intelligence",
    "territoryIntelligence.metricHealthScore": "Health Score",
    "territoryIntelligence.metricSalesGrowth": "Sales Growth",
    "territoryIntelligence.metricActiveCustomerRate": "Active Customer Rate",
    "territoryIntelligence.metricLostSales": "Lost Sales",
    "territoryIntelligence.metricVisitCoverage": "Visit Coverage",
    "territoryIntelligence.metricCollectionHealth": "Collection Health",
    "territoryIntelligence.metricOpportunityValue": "Opportunity Value",
    "territoryIntelligence.tierExcellent": "Excellent",
    "territoryIntelligence.tierGood": "Good",
    "territoryIntelligence.tierAverage": "Average",
    "territoryIntelligence.tierWeak": "Weak",
    "territoryIntelligence.tierVeryWeak": "Very Weak",
    "territoryIntelligence.panelSummaryTab": "Summary",
    "territoryIntelligence.panelPerformanceTab": "Performance",
    "territoryIntelligence.panelRiskTab": "Risk",
    "territoryIntelligence.panelOpportunityTab": "Opportunity",
    "territoryIntelligence.panelComparisonTab": "Comparison",
    "territoryIntelligence.panelWhyTitle": "Why",
    "territoryIntelligence.panelRecommendationTitle": "Smart Recommendation",
    "territoryIntelligence.panelSuggestedActionsTitle": "Suggested Decision",
    "territoryIntelligence.panelExpectedImpactTitle": "Expected Impact",
    "territoryIntelligence.panelCtaCreateVisitPlan": "Create Visit Plan for Region",
    "territoryIntelligence.panelClose": "Close",
    "territoryIntelligence.rankingTitle": "Territory Ranking",
    "territoryIntelligence.rankingCustomersBadge": "{count} customers",
    "territoryIntelligence.emptyState": "Not enough data to show territories yet.",
    "territoryIntelligence.loading": "Loading Territory Intelligence...",
    "territoryIntelligence.errorLoad": "Failed to load territory data.",
    "territoryIntelligence.executiveModeToggle": "Executive Mode",
    "territoryIntelligence.executiveTopOpportunities": "Top 5 Opportunities",
    "territoryIntelligence.executiveWorstTerritories": "Worst 5 Territories",
    "territoryIntelligence.executiveFastestWin": "Fastest Win",
    "territoryIntelligence.executiveBiggestRisk": "Biggest Risk",
    "territoryIntelligence.executiveViewMap": "View Map",
    "territoryIntelligence.quickToolsTitle": "Quick Tools",
    "territoryIntelligence.exportPpt": "Export PPT",
    "territoryIntelligence.exportImage": "Export Image",
    "territoryIntelligence.selectTerritoryHint": "Select a territory from the map or ranking to see details.",
    "territoryIntelligence.comparisonPickSecond": "Pick a second territory to compare",
    "territoryIntelligence.comparisonTitle": "Territory Comparison",
    "territoryIntelligence.noWhyItems": "No flagged situations for this territory right now.",
    "territoryIntelligence.breadcrumbRoot": "All Territories",
    "territoryIntelligence.levelCity": "City",
    "territoryIntelligence.levelCustomer": "Customer",
    "territoryIntelligence.goUp": "Back to parent level",
    "territoryIntelligence.drillIntoHint": "Click to view customers inside this territory",
    "territoryIntelligence.metricRiskLevel": "Risk Level",
    "territoryIntelligence.riskHigh": "High",
    "territoryIntelligence.riskMedium": "Medium",
    "territoryIntelligence.riskLow": "Low",
    "territoryIntelligence.panelLastUpdated": "Last updated",
    "territoryIntelligence.panelRanking": "Ranking",
    "territoryIntelligence.panelRankingValue": "{rank} of {total}",
    "territoryIntelligence.panelVsLastMonth": "vs last month",
    "territoryIntelligence.panelAiInsightTitle": "AI Insight",
    "territoryIntelligence.panelGrowthOpportunitiesTitle": "Growth Opportunities",
    "territoryIntelligence.panelVisitPlanTitle": "Suggested Visit Plan",
    "territoryIntelligence.panelVisitPlanHint": "Start executing these recommendations in the next visit plan.",
    "territoryIntelligence.panelCompareBtn": "Compare Territories",
    "territoryIntelligence.panelExportBtn": "Export Report",
    "territoryIntelligence.panelShareBtn": "Share",
    "territoryIntelligence.customerLevelTitle": "{name} Customers",
    "territoryIntelligence.customerLevelHint": "Top customers by sales inside this territory",
    "territoryIntelligence.customerLevelEmpty": "No customers with valid coordinates in this territory.",
    "territoryIntelligence.customerSalesLabel": "Sales",
    "territoryIntelligence.boundarySourcePlaceholder": "Approximated boundary data (demo dataset)",
    "territoryIntelligence.layersPanelTitle": "Analysis Layers",
    "territoryIntelligence.layerActiveBadge": "Active",
    "territoryIntelligence.displayModeHeat": "Heat",
    "territoryIntelligence.displayModeCluster": "Cluster",
    "territoryIntelligence.displayModePoints": "Points",
    "territoryIntelligence.displayModeSectionTitle": "Map Type",
    "territoryIntelligence.invalidCoordinatesNotice": "{count} locations with invalid coordinates excluded",
    "territoryIntelligence.coLocatedCustomers": "{count} customers at this location — click to spread out",
    "territoryIntelligence.metricNoData": "No data",
    "territoryIntelligence.customersCountSuffix": "customers",
    "territoryIntelligence.aggregationSum": "sum",
    "territoryIntelligence.aggregationAverage": "avg",
    "territoryIntelligence.legendLow": "Low",
    "territoryIntelligence.legendHigh": "High",
    "territoryIntelligence.exportCsv": "Export CSV",
    "territoryIntelligence.exportSuccess": "Export complete",
    "territoryIntelligence.exportError": "Export failed — try again",
    "territoryIntelligence.exporting": "Exporting...",
    "territoryIntelligence.exportTotalCustomers": "Customers",
    "territoryIntelligence.exportUniqueLocations": "Unique locations",
    "territoryIntelligence.exportExcludedCoordinates": "Excluded coordinates",
    "territoryIntelligence.exportScopeAll": "All Territories",
    "territoryIntelligence.metricSectionTitle": "Metric",
    "territoryIntelligence.returnToDecisionStudio": "Return to Decision Analytics Studio",
    "decisionAnalyticsStudio.title": "Decision Analytics Studio",
    "decisionAnalyticsStudio.subtitle": "Analyze your sales from any angle, and spot opportunities and risks at a glance.",
    "decisionAnalyticsStudio.resetFilters": "Reset Filters",
    "decisionAnalyticsStudio.openTerritoryIntelligence": "Open Territory Intelligence",
    "decisionAnalyticsStudio.dateRangeSeparator": "to",
    "decisionAnalyticsStudio.activeFiltersCount": "{count} active filters",
    "decisionAnalyticsStudio.loading": "Loading analysis...",
    "decisionAnalyticsStudio.permissionDenied": "You don't have permission to view this screen.",
    "decisionAnalyticsStudio.errorLoad": "Failed to load analysis data.",
    "decisionAnalyticsStudio.noData": "No invoice data uploaded yet to show this analysis.",
    "decisionAnalyticsStudio.emptyResult": "No results for the selected filters and date range.",
    "decisionAnalyticsStudio.filterBranch": "Branch",
    "decisionAnalyticsStudio.filterTerritory": "Territory",
    "decisionAnalyticsStudio.filterChannel": "Channel",
    "decisionAnalyticsStudio.filterCategory": "Category",
    "decisionAnalyticsStudio.filterBrand": "Brand",
    "decisionAnalyticsStudio.filterProduct": "Product",
    "decisionAnalyticsStudio.filterCustomer": "Customer",
    "decisionAnalyticsStudio.filterRepresentative": "Representative",
    "decisionAnalyticsStudio.filterSupervisor": "Supervisor",
    "decisionAnalyticsStudio.kpiSales": "Sales",
    "decisionAnalyticsStudio.kpiGrowth": "Growth",
    "decisionAnalyticsStudio.kpiCoverage": "Coverage",
    "decisionAnalyticsStudio.kpiOrders": "Orders",
    "decisionAnalyticsStudio.kpiCollections": "Collections",
    "decisionAnalyticsStudio.kpiStrikeRate": "Strike Rate",
    "decisionAnalyticsStudio.kpiActiveCustomers": "Active Customers",
    "decisionAnalyticsStudio.kpiLostSales": "Lost Sales",
    "decisionAnalyticsStudio.kpiAverageOrder": "Average Order",
    "decisionAnalyticsStudio.kpiProductivity": "Productivity",
    "decisionAnalyticsStudio.dimTerritory": "Territory",
    "decisionAnalyticsStudio.dimChannel": "Channel",
    "decisionAnalyticsStudio.dimCategory": "Category",
    "decisionAnalyticsStudio.dimBrand": "Brand",
    "decisionAnalyticsStudio.dimProduct": "Product",
    "decisionAnalyticsStudio.dimCustomer": "Customer",
    "decisionAnalyticsStudio.dimRepresentative": "Representative",
    "decisionAnalyticsStudio.dimSupervisor": "Supervisor",
    "decisionAnalyticsStudio.drillHint": "Click any item to drill in",
    "decisionAnalyticsStudio.chartColumn": "Column",
    "decisionAnalyticsStudio.chartBar": "Bar",
    "decisionAnalyticsStudio.chartLine": "Line",
    "decisionAnalyticsStudio.chartArea": "Area",
    "decisionAnalyticsStudio.chartStacked": "Stacked",
    "decisionAnalyticsStudio.chartPie": "Pie",
    "decisionAnalyticsStudio.chartTreemap": "Treemap",
    "decisionAnalyticsStudio.chartScatter": "Scatter Plot",
    "decisionAnalyticsStudio.chartPareto": "Pareto",
    "decisionAnalyticsStudio.chartTable": "Data Table",
    "decisionAnalyticsStudio.otherSlice": "Other",
    "decisionAnalyticsStudio.tooltipTarget": "Target",
    "decisionAnalyticsStudio.tooltipAchievement": "Achievement",
    "decisionAnalyticsStudio.tableColLabel": "Item",
    "decisionAnalyticsStudio.aiInsightTitle": "AI Insight",
    "decisionAnalyticsStudio.aiInsightEmpty": "No flagged situations for the current scope right now.",
    "decisionAnalyticsStudio.severityHigh": "High",
    "decisionAnalyticsStudio.severityMedium": "Medium",
    "decisionAnalyticsStudio.severityLow": "Low",
    "decisionAnalyticsStudio.detailTableTitle": "Invoice Detail",
    "decisionAnalyticsStudio.detailTableCount": "{count} rows",
    "decisionAnalyticsStudio.colInvoice": "Invoice",
    "decisionAnalyticsStudio.colDate": "Date",
    "decisionAnalyticsStudio.colCustomer": "Customer",
    "decisionAnalyticsStudio.colProduct": "Product",
    "decisionAnalyticsStudio.pageOf": "Page {page} of {total}",
    "geoEngine.title": "Geo Intelligence Engine",
    "geoEngine.subtitle": "Phase 1 preview: the unified filters and data engine behind every FSOS map.",
    "geoEngine.phase1Notice": "This is a Phase 1 preview (engine + filters only) — the polished Heat/Bubble/Cluster/Choropleth map modes are Phase 2. The goal here is to confirm the unified filters and underlying data are correct.",
    "geoEngine.phase2Notice": "Phase 2: switch between map modes (Heat / Bubble / Cluster / Territory) — all reading from the same engine and filters. Drill-down and AI integration are Phase 3.",
    "geoEngine.phase3Notice": "Phase 3: click any map point or chart bar to drill between City and Customer — everything on screen (KPIs, chart, AI panel, detail table) updates automatically.",
    "geoEngine.modeLabel": "Map mode",
    "geoEngine.modeHeat": "Heat",
    "geoEngine.modeBubble": "Bubble",
    "geoEngine.modeCluster": "Cluster",
    "geoEngine.modeTerritory": "Territory",
    "geoEngine.dateFromLabel": "From date",
    "geoEngine.dateToLabel": "To date",
    "geoEngine.kpiLabel": "KPI",
    "geoEngine.groupByLabel": "Group by",
    "geoEngine.groupByCustomer": "Customer",
    "geoEngine.groupByCity": "City",
    "geoEngine.kpiSales": "Sales",
    "geoEngine.kpiOrders": "Orders",
    "geoEngine.kpiCustomers": "Customer Density",
    "geoEngine.kpiVisits": "Visits",
    "geoEngine.kpiCollections": "Collections",
    "geoEngine.kpiReturns": "Returns",
    "geoEngine.kpiLostSales": "Lost Sales",
    "geoEngine.filterBranch": "Branch",
    "geoEngine.filterCity": "City",
    "geoEngine.filterChannel": "Channel",
    "geoEngine.filterCategory": "Category",
    "geoEngine.filterBrand": "Brand",
    "geoEngine.filterProduct": "Product",
    "geoEngine.filterCustomer": "Customer",
    "geoEngine.filterRepresentative": "Representative",
    "geoEngine.filterSupervisor": "Supervisor",
    "geoEngine.updateButton": "Update Map",
    "geoEngine.updatingButton": "Updating...",
    "geoEngine.loading": "Loading...",
    "geoEngine.errorLoad": "Failed to load data.",
    "geoEngine.emptyResult": "No results for the selected filters and date range.",
    "geoEngine.pointsBadge": "{count} points",
    "geoEngine.totalBadge": "Total: {total}",
    "geoEngine.excludedBadge": "{count} without valid coordinates",
    "geoEngine.chartTitle": "Top 10 by value",
    "geoEngine.kpiCardTotal": "Total",
    "geoEngine.kpiCardMax": "Max Value",
    "geoEngine.kpiCardPoints": "Points",
    "geoEngine.kpiCardExcluded": "Excluded Coordinates",
    "geoEngine.executiveReset": "Reset View",
    "geoEngine.executiveFullscreen": "Fullscreen",
    "geoEngine.executiveExitFullscreen": "Exit Fullscreen",
    "geoEngine.executiveExportImage": "Export Image",
    "geoEngine.executiveExportPdf": "Export PDF",
    "geoEngine.executiveExportError": "Export failed, please try again.",
    "shell.brand": "Murshidak",
    "shell.tagline": "Sales Intelligence in Your Hands",
    "shell.logout": "Log out",
    "shell.more": "More",
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
    "files.employeeExportsTitle": "Employee Exports",
    "files.employeeExportsSubtitle": "Export a filtered Excel file for a specific employee — containing only the data they're authorized to see, ready to upload to their own GPT conversation.",
    "files.employeeExportsEmpty": "No employees available to export right now.",
    "files.exportRangeAll": "All time",
    "files.exportRangeLast1Month": "Last month",
    "files.exportRangeLast3Months": "Last 3 months",
    "files.exportRangeLast6Months": "Last 6 months",
    "files.exportRangeLast12Months": "Last 12 months",
    "files.exportRangeFrom": "From",
    "files.exportRangeTo": "To",
    "files.deleteSuccess": "File deleted",
    "files.deleteError": "Failed to delete file",
    "files.downloadUrlError": "Failed to create download link",
    "files.confidenceSuffix": " ({percent}% confidence)",
    "files.classifiedSuccess": "âœ“ {fileName} — detected as {datasetType}{confidence}",
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
    "files.batchSkipped": "\"{fileName}\" — {count} sheet(s) skipped, already active with identical content: {entities}",
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
    "files.sheetInfo": "— appears to be {type}{confidencePart} آ· {count} rows",
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
    "assistant.adviceLabel": "Advice",
    "assistant.decisionLabel": "Decision",
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
    "heatmap.layersEnable": "Multiple layers (compare several values at once)",
    "heatmap.layersDisable": "Turn off multiple layers",
    "heatmap.layerDimensionLabel": "Layer dimension",
    "heatmap.layersHint": "Pick one or more values — each becomes its own heat layer you can toggle on/off from the list next to the map in the result.",
    "heatmap.layersBadge": "{count} layers",
    "heatmap.exportExcelButton": "Export Excel",
    "heatmap.sheetName": "Heat Map",
    "heatmap.fileName": "heat-map.xlsx",
    "heatmap.colLayer": "Layer",
    "heatmap.colLabel": "Location",
    "heatmap.colMetric": "Metric",
    "heatmap.colValue": "Value",
    "heatmap.colLat": "Latitude",
    "heatmap.colLon": "Longitude",
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
    "sgi.title": "Growth Opportunity Center",
    "sgi.subtitle": "The best sales, collection, and win-back opportunities available right now, ranked by priority.",
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
    "sgi.performanceKpis": "Performance KPIs",
    "sgi.actualSales": "Actual sales",
    "sgi.activeCustomers": "Active customers",
    "sgi.kpiLoading": "Loading performance KPIs…",
    "sgi.kpiNoRepStats": "No performance KPIs are available for this report.",
    "sgi.kpiMissingCurrentUserEmail": "Your email could not be identified to show performance KPIs.",
    "sgi.kpiEmptyTeam": "No team members are available in this report.",
    "sgi.exportPdf": "Export PDF report",
    "sgi.exportPdfPending": "Generating report…",
    "sgi.exportPdfError": "Couldn't export the report",
    "sgi.pdfReportTitle": "Growth Opportunity Center — Report",
    "sgi.pdfGeneratedAtLabel": "Report date",
    "sgi.pdfExecutiveSummaryTitle": "Executive Summary",
    "sgi.pdfTotalOpportunitiesLabel": "Total opportunities",
    "sgi.pdfHighSeverityLabel": "High priority",
    "sgi.pdfTargetAchievementTitle": "Monthly target achievement",
    "sgi.pdfTargetAchievedOf": "{actual} of {target} ({pct}%)",
    "sgi.pdfNoTargetNote": "No monthly target set for this period.",
    "sgi.pdfTopByCategoryTitle": "Top opportunities by category",
    "sgi.pdfDeferredTitle": "Opportunity types not yet supported",
    "sgi.pdfDeferredNote": "The following (average invoice, due-date collection, up-sell, geo-based opportunities) require approved backend data and business rules not currently available in SGI — no logic was invented for them. Deferred — requires approved backend data and business rules.",
    "sgi.pdfFullListTitle": "Full priority-ranked details",
    "sgi.pdfNoOwnerLabel": "Unassigned",
    "employees.title": "Employees",
    "employees.subtitle": "The company's official employee roster — completely separate from login accounts (users). An employee is an employment record, not a login account.",
    "employees.addEmployee": "Add employee",
    "employees.resyncFromUpload": "Sync from uploaded file",
    "employees.resyncSuccess": "Synced — {count} employees from the uploaded file.",
    "employees.resyncNoDataset": "No Employees file is currently uploaded to sync from.",
    "employees.resyncError": "Sync failed. Please try again.",
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
    "employees.exportData": "Export Employee Data (Excel)",
    "employees.toastExportError": "Could not export employee data",
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
    "account.title": "Account & Security",
    "account.subtitle": "Review your account details and manage your password securely.",
    "account.profileTitle": "Account Information",
    "account.name": "Name",
    "account.email": "Email",
    "account.role": "Role",
    "account.company": "Company",
    "account.companyUnavailable": "Company could not be loaded",
    "account.noCompany": "No company is linked",
    "account.passwordTitle": "Change Password",
    "account.passwordDescription": "After changing it, you will be signed out from this device and all other devices.",
    "account.currentPassword": "Current Password",
    "account.newPassword": "New Password",
    "account.confirmNewPassword": "Confirm New Password",
    "account.showPassword": "Show password",
    "account.hidePassword": "Hide password",
    "account.currentPasswordRequired": "Enter your current password.",
    "account.passwordRequirements": "Your new password must meet the required strength policy.",
    "account.passwordMismatch": "Password confirmation does not match the new password.",
    "account.passwordReuseError": "Your new password must be different from your current password.",
    "account.currentPasswordIncorrect": "Your current password is incorrect.",
    "account.passwordChangeSuccess": "Password changed. Signing you out now.",
    "account.passwordChangeError": "Could not change your password. Please try again.",
    "account.changePassword": "Change Password",
    "account.loggingOut": "Signing out…",
    "account.emailTitle": "Change email address",
    "account.emailDescription": "Changing your email signs you out of every session.",
    "account.newEmail": "New email address",
    "account.confirmEmail": "Confirm email address",
    "account.emailMismatch": "Email addresses do not match",
    "account.changeEmail": "Change email address",
    "account.emailChangeSuccess": "Email changed. Signing out…",
    "account.emailChangeError": "Could not change email address.",
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
    "newCustomer.title":"New Customer","newCustomer.subtitle":"Analyze a new customer location or scan an entire territory to discover expansion areas.","newCustomer.pointTab":"Single Customer (Specific Location)","newCustomer.territoryTab":"Full Territory (Discover Expansion Areas)","newCustomer.gpsUnsupported":"This browser does not support location services","newCustomer.locationFound":"Location identified","newCustomer.locationError":"Could not access your location — select it on the map or enter it manually","newCustomer.invalidCoordinates":"Invalid coordinates","newCustomer.analysisComplete":"Analysis complete — {customers} reference customers, {products} products","newCustomer.analysisError":"Could not complete the analysis","newCustomer.talkingPointsError":"Could not generate talking points","newCustomer.stepLocation":"Location","newCustomer.stepCustomers":"Customers & Analysis","newCustomer.step1Title":"Step 1 — Customer Location","newCustomer.gpsTab":"Location (GPS)","newCustomer.mapTab":"Select on Map","newCustomer.manualTab":"Manual Entry","newCustomer.useCurrentLocation":"Use My Current Location","newCustomer.mapHint":"Click the map or drag the marker to set the customer location precisely.","newCustomer.latitude":"Latitude","newCustomer.longitude":"Longitude","newCustomer.useCoordinates":"Use These Coordinates","newCustomer.selectedLocation":"Selected location:","newCustomer.nextCustomers":"Next — Select Customers","newCustomer.step2Title":"Step 2 — Select Reference Customers & Analyze","newCustomer.backToLocation":"Back to Edit Location","newCustomer.referenceMethod":"Reference Customer Selection Method","newCustomer.automatic":"Automatic (Nearest Customers)","newCustomer.manual":"Manual (Search & Select)","newCustomer.both":"Both","newCustomer.nearestCustomers":"Number of Nearest Customers","newCustomer.automaticNearestCustomers":"Automatically Selected Nearest Customers","newCustomer.runAnalysis":"Run Analysis","newCustomer.result":"Result","newCustomer.referenceCustomers":"Reference Customers","newCustomer.products":"Products","newCustomer.excludedInvalidCoordinates":"excluded row (invalid coordinates)","newCustomer.referenceCustomersMap":"Reference Customers on Map","newCustomer.topProductAssortment":"Top-Selling Product Assortment","newCustomer.product":"Product","newCustomer.category":"Category","newCustomer.totalQuantity":"Total Quantity","newCustomer.totalValue":"Total Value","newCustomer.customerCount":"Customer Count","newCustomer.talkingPointsTitle":"AI Talking Points (Optional)","newCustomer.talkingPointsHint":"AI analyzes the top-selling product assortment and prepares a concise summary and practical talking points for the sales rep to use with the new customer.","newCustomer.areaLabel":"Area Name (Optional — for Better Context)","newCustomer.areaPlaceholder":"Example: South Jeddah","newCustomer.generateTalkingPoints":"Generate AI Talking Points","newCustomer.expansionComplete":"{count} candidate expansion areas","newCustomer.expansionError":"Could not run the analysis","newCustomer.territoryTitle":"Territory Scan — Discover Expansion Areas","newCustomer.territoryHint":"The territory is divided into cells; each customer-free area is scored based on nearby customers and sales.","newCustomer.scopeField":"Scope Field (Optional — Territory/Area)","newCustomer.noneOptional":"None (Optional)","newCustomer.scopeValue":"Scope Value","newCustomer.loading":"Loading…","newCustomer.all":"All","newCustomer.gridSize":"Cell Size (km)","newCustomer.runScan":"Run Scan","newCustomer.candidateAreas":"Candidate Area","newCustomer.searchCustomers":"Search by name or code…","newCustomer.noResults":"No results","newCustomer.selectedCustomers":"selected customers","newCustomer.scopeRoute":"Route","newCustomer.scopeCity":"City","newCustomer.scopeCustomerClass":"Customer Class","newCustomer.scopeChannel":"Channel",
    "newCustomer.km":"km",
    "routePlanning.__reserved": "",
    "visitEfficiency.__reserved": "",
    "visitEfficiency.title": "Visit Efficiency", "visitEfficiency.subtitle": "Measures the distance between each representative's consecutive visits on the same day to identify inefficient routes.", "visitEfficiency.settings": "Settings", "visitEfficiency.scopeField": "Filter scope (optional)", "visitEfficiency.scopeRoute": "Route", "visitEfficiency.scopeCity": "City", "visitEfficiency.scopeCustomerClass": "Customer class", "visitEfficiency.scopeChannel": "Channel", "visitEfficiency.noFilter": "No filter", "visitEfficiency.scopeValues": "Scope values (optional — leave empty for all data)", "visitEfficiency.selectAll": "Select all", "visitEfficiency.clearAll": "Clear all", "visitEfficiency.loading": "Loading…", "visitEfficiency.noScopeValues": "No values in this column", "visitEfficiency.selectedValues": "{count} values selected", "visitEfficiency.fromDate": "From date (optional)", "visitEfficiency.toDate": "To date (optional)", "visitEfficiency.analyze": "Analyze now", "visitEfficiency.analyzing": "Analyzing…", "visitEfficiency.analysisComplete": "{visits} visits across {reps} representatives", "visitEfficiency.analysisError": "Could not run the analysis", "visitEfficiency.result": "Result", "visitEfficiency.visits": "{count} visits", "visitEfficiency.excludedSingleVisitDays": "{count} single-visit days excluded", "visitEfficiency.excludedNoCoordinates": "{count} visits without valid coordinates", "visitEfficiency.rowOrder": "Ordered by row order (no check-in time)", "visitEfficiency.exportExcel": "Export Excel", "visitEfficiency.noMapPoints": "There are no locations to display on the map for this data.", "visitEfficiency.noMapPointsHint": "Each representative may have only one visit per day, or coordinates may be missing or invalid.", "visitEfficiency.visibleReps": "Representatives visible on the map: {summary}", "visitEfficiency.all": "All", "visitEfficiency.selectedOf": "{selected} of {total}", "visitEfficiency.rep": "Representative", "visitEfficiency.visitDays": "Visit days", "visitEfficiency.visitCount": "Visits", "visitEfficiency.totalDistance": "Total distance (km)", "visitEfficiency.avgDistance": "Average/visit (km)", "visitEfficiency.noRepVisits": "This representative has no visits with valid coordinates.", "visitEfficiency.date": "Date", "visitEfficiency.customer": "Customer", "visitEfficiency.distanceFromPrevious": "Distance from previous visit (km)", "visitEfficiency.total": "Total", "visitEfficiency.exportSummarySheet": "Representative Summary", "visitEfficiency.exportDetailsSheet": "Visit Details", "visitEfficiency.exportFileName": "visit-efficiency.xlsx",
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
    "teamPerformance.exportExecutiveButton": "Export executive deck",
    "teamPerformance.exportExecutiveSuccess": "Executive deck generated with {count} slides.",
    "teamPerformance.exportExecutiveError": "Could not generate the executive deck.",
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
    "teamPerformance.supervisor": "Supervisor", "teamPerformance.allSupervisors": "All supervisors", "teamPerformance.salesRep": "Sales rep", "teamPerformance.allSalesReps": "All sales reps", "teamPerformance.comparisonFrom": "Comparison from", "teamPerformance.comparisonTo": "Comparison to", "teamPerformance.clearComparison": "Clear comparison", "teamPerformance.focusMode": "Focus mode", "teamPerformance.compareMode": "Compare mode", "teamPerformance.showAdditionalTargets": "Show additional targets", "teamPerformance.hideAdditionalTargets": "Hide additional targets", "teamPerformance.compareGrowth": "Growth rates", "teamPerformance.compareTargets": "Performance vs target", "teamPerformance.compareAdditionalTargets": "Additional targets", "teamPerformance.selectEntities": "Select at least two entities from the same level to compare.", "teamPerformance.salesAchievement": "Sales achievement", "teamPerformance.diagnosis": "Diagnosis", "teamPerformance.close": "Close", "teamPerformance.targetInsight": "Click to see why this target is ahead or behind",
    "teamPerformance.diagnosisSummaryPositive": "Positive performance signal in the selected scope.", "teamPerformance.diagnosisSummaryNegative": "Performance signal requiring action in the selected scope.", "teamPerformance.diagnosisEvidence": "Evidence", "teamPerformance.diagnosisCause": "Possible cause", "teamPerformance.diagnosisUnknown": "What cannot be confirmed", "teamPerformance.diagnosisConfidence": "Confidence", "teamPerformance.diagnosisAction": "Executive action", "teamPerformance.diagnosisEntities": "Most impactful entities",
    "teamPerformance.mediumConfidence": "Medium",
    "copilot.title": "Visit Copilot",
    "copilot.subtitle": "Your day plan and visits — everything you need before walking in.",
    "copilot.periodLabel": "Period",
    "copilot.period1m": "Last month",
    "copilot.period3m": "Last 3 months",
    "copilot.period6m": "Last 6 months",
    "copilot.period12m": "Last 12 months",
    "copilot.periodCustom": "Custom period",
    "copilot.planDateLabel": "Plan date",
    "copilot.planDateToday": "Today",
    "copilot.planningModeBadge": "Pre-Planning Mode",
    "copilot.planningModeNotice": "You're browsing a plan for a day that hasn't happened yet — customers and numbers are a projection from the recurring weekly visit pattern, and you can't start or log an actual visit until that day arrives.",
    "copilot.executionModeBadge": "Today Execution Mode",
    "copilot.startVisitBlockedFuture": "This date hasn't happened yet — preparation and analysis are available, but you can't start or log an actual visit.",
    "copilot.noCustomersForDate": "No customers are normally visited on {weekday} per the weekly visit pattern.",
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
    "copilot.collectedLabel": "Collections",
    "copilot.trendLabel": "Trend",
    "copilot.customer360SoldProducts": "Sold products",
    "copilot.customer360StoppedProducts": "Stopped products",
    "copilot.customer360SalesRank": "Sales rank",
    "copilot.customer360SalesRankValue": "Rank {rank} of {total}",
    "copilot.customer360SoldProductsPeriod": "Products sold during this period",
    "copilot.customer360StoppedProductsPeriod": "Products stopped during this period",
    "copilot.customer360ExpandAll": "Expand all",
    "copilot.customer360CollapseAll": "Collapse all",
    "copilot.customer360NoProducts": "No products match this period.",
    "copilot.customer360Uncategorized": "Uncategorized",
    "copilot.customer360Quantity": "Quantity",
    "copilot.customer360PreviousQuantity": "Previous-period quantity",
    "copilot.customer360LastPurchase": "Last purchase",
    "copilot.customer360StoppedStatus": "Status: stopped in the recent period",
    "copilot.customer360DataUnavailable": "Data unavailable",
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
    "copilot.summary360Button": "Today's 360آ° Summary",
    "copilot.summary360Title": "Today's 360آ° Summary",
    "copilot.summary360Loading": "Preparing today's summary…",
    "copilot.summary360Error": "Could not load today's summary",
    "copilot.summary360Retry": "Retry",
    "copilot.summary360Empty": "Not enough data to show a summary right now.",
    "copilot.summary360ScopeLine": "{scope} — {role} {user} — {from} to {to}",
    "copilot.summary360ExecutiveSummary": "Executive Summary",
    "copilot.summary360TopIssue": "Top Issue Today",
    "copilot.summary360Goal": "Monthly Goal",
    "copilot.summary360GoalTarget": "Target",
    "copilot.summary360GoalActual": "Achieved",
    "copilot.summary360GoalRemaining": "Remaining",
    "copilot.summary360NoGoal": "No target set for your scope",
    "copilot.summary360LostOpportunities": "Lost Opportunities",
    "copilot.summary360NoLostOpportunities": "No lost opportunities under the current criterion",
    "copilot.summary360NoCustomers": "No customers are planned for the selected date",
    "copilot.summary360NoBaselineSales": "There are not enough baseline sales to calculate opportunities",
    "copilot.summary360DataUnavailable": "Opportunities could not be calculated because required data is unavailable",
    "copilot.summary360BaselineQuantity": "90-day sales: {value}",
    "copilot.summary360RecentQuantity": "Last 30 days: {value}",
    "copilot.summary360SuggestedQuantity": "Suggested quantity: {value}",
    "copilot.summary360DeclineValue": "Decline value: {value}",
    "copilot.summary360DeclineQuantity": "Decline quantity: {value}",
    "copilot.summary360BeforeAfter": "Before: {before} → After: {after}",
    "copilot.summary360LastVisit": "Last visit: {date}",
    "copilot.summary360LastVisitUnknown": "Last visit: unknown",
    "copilot.summary360StoppedProducts": "Stopped products",
    "copilot.summary360Diagnosis": "Diagnosis",
    "copilot.summary360VisitDecision": "Visit action",
    "copilot.summary360LikelyReason": "Likely reason",
    "copilot.summary360VisitGoal": "Visit goal",
    "copilot.summary360MoreProducts": "+{count} more product(s)",
    "copilot.summary360Uncategorized": "Uncategorized",
    "copilot.summary360OpportunityCount": "Opportunities: {value}",
    "copilot.summary360ProductCount": "Products: {value}",
    "copilot.summary360TotalSuggestedQuantity": "Total suggested quantity: {value}",
    "copilot.summary360TotalDecline": "Total decline quantity: {value}",
    "copilot.summary360ExcludeReason": "Reason for exclusion (optional)",
    "copilot.summary360ExcludedProducts": "Excluded products",
    "copilot.summary360RevokeExclusion": "Revoke exclusion",
    "copilot.summary360ExclusionRevoked": "Exclusion revoked",
    "copilot.summary360ScopeCUSTOMER_PRODUCT": "Customer rejection",
    "copilot.summary360ScopeSALESPERSON_PRODUCT": "Salesperson exclusion",
    "copilot.summary360ScopeTEAM_PRODUCT": "Team exclusion",
    "copilot.summary360ScopeCOMPANY_PRODUCT": "Company exclusion",
    "copilot.summary360ExcludeMenu": "Exclude product",
    "copilot.summary360ExcludeCustomerProduct": "Customer rejects product",
    "copilot.summary360ExcludeSalespersonProduct": "Hide for me",
    "copilot.summary360ExcludeTeamProduct": "Exclude for my team",
    "copilot.summary360ExcludeCompanyProduct": "Exclude company-wide",
    "copilot.summary360ExcludeConfirm": "Apply: {scope}?",
    "copilot.summary360ExclusionSaved": "Product excluded from lost opportunities",
    "copilot.summary360ExclusionError": "Could not save the product exclusion",
    "copilot.summary360Collections": "Collections",
    "copilot.summary360Collected": "Collected",
    "copilot.summary360Pending": "Pending",
    "copilot.summary360Bounced": "Bounced",
    "copilot.summary360PriorityDebtors": "Priority debtors",
    "copilot.summary360Returns": "Returns",
    "copilot.summary360ReturnsTotal": "Total returns",
    "copilot.summary360ReturnsRate": "Returns rate of sales",
    "copilot.summary360NoReturns": "No returns recorded for today's customers in this period",
    "copilot.summary360InterventionNeeded": "Needs intervention",
    "copilot.summary360RootCauses": "Likely root causes",
    "copilot.summary360ExecutiveDecision": "Executive decision",
    "copilot.summary360ExecutionPlan": "Execution plan",
    "copilot.summary360PlanPriority": "Priority",
    "copilot.summary360PlanAction": "Action",
    "copilot.summary360PlanOwner": "Owner",
    "copilot.summary360PlanMetric": "Success metric",
    "copilot.summary360ClosingPhrase": "The field is the source of truth",
    "copilot.summary360AiSourced": "Phrased with AI assistance, based on real numbers",
    "copilot.summary360TemplateSourced": "Generated from a fixed template",
    "copilot.summary360ExportPdf": "Export PDF",
    "copilot.summary360ExportingPdf": "Exporting…",
    "copilot.summary360ExportError": "Could not export the PDF",
    "copilot.summary360Close": "Close",
    "copilot.summary360ReportScope": "Report Scope", "copilot.summary360ScopeLabel": "Scope:", "copilot.summary360ReportDate": "Date:", "copilot.summary360ComparisonPeriod": "Comparison Period:",
    "copilot.prospectVisitAdded": "Visit added.", "copilot.prospectVisitError": "Could not schedule the visit.", "copilot.businessHotels": "Hotels", "copilot.businessRestaurants": "Restaurants", "copilot.businessCafes": "Cafés", "copilot.businessOther": "Other", "copilot.minProspectScore": "Minimum Prospect Score", "copilot.sortProspectScore": "Sort: Prospect Score", "copilot.sortCatalogFit": "Sort: Catalog Fit", "copilot.collapseAll": "Collapse All", "copilot.expandAll": "Expand All", "copilot.photoAttribution": "Photo: {attribution}", "copilot.businessTypeUnavailable": "Business type unavailable", "copilot.prospectScore": "Prospect Score: {value}/100", "copilot.analysisConfidence": "Analysis Confidence: {value}%", "copilot.catalogFit": "Company Product Fit: {value}", "copilot.notCalculated": "Not calculated yet", "copilot.topSellingNearby": "Top-Selling Products Nearby", "copilot.soldToNearbyCustomers": "— sold by {count} nearby customers", "copilot.notEnoughLocalSalesData": "Not enough local sales data to recommend products", "copilot.basedOnNearbyCustomers": "Based on sales from {count} nearby customers in the same area", "copilot.salesOpportunity": "Sales Opportunity", "copilot.addressUnavailable": "Address unavailable", "copilot.dataSource": "Data source: {source}", "copilot.whyThisProspect": "Why this prospect? {reason}", "copilot.directions": "Directions", "copilot.call": "Call", "copilot.hideDetails": "Hide details", "copilot.details": "Details", "copilot.addToday": "Add Today", "copilot.scheduleLater": "Schedule Later",
    "nav.smartLoading": "Smart Loading",
    "smartLoading.title": "Smart Loading",
    "smartLoading.subtitle": "Prepare the vehicle before starting the route.",
    "smartLoading.summaryTitle": "Loading Summary",
    "smartLoading.summaryDescription": "A quick operational view before departure.",
    "smartLoading.productsToLoad": "Products to Load",
    "smartLoading.totalQuantity": "Total Quantity",
    "smartLoading.priorityProducts": "Priority Products",
    "smartLoading.operationalPriorityProducts": "Operational Priority Products",
    "smartLoading.noOperationalPriority": "No operational priority is currently identified.",
    "smartLoading.operationalPriorityProductsPanelTitle": "Operational Priority Products",
    "smartLoading.lastCalculation": "Last Calculation",
    "smartLoading.preliminaryStockNotice": "Vehicle stock is unavailable. Quantities shown are preliminary needs before deducting current stock.",
    "smartLoading.preliminaryNeed": "Preliminary need",
    "smartLoading.manualVehicleStock": "Vehicle stock",
    "smartLoading.manualVehicleStockHint": "Enter the available balance to turn the preliminary need into a final recommendation.",
    "smartLoading.targetDate": "Prepare loading for",
    "smartLoading.routeCustomers": "Route customers",
    "smartLoading.noRouteForDate": "No route is scheduled for this day.",
    "smartLoading.noRoutePriority": "No priority products are available for this route day.",
    "smartLoading.changeDateConfirm": "Changing the loading day will discard local changes. Continue?",
    "smartLoading.attentionTitle": "Today's Attention",
    "smartLoading.attentionDescription": "Operational facts worth reviewing.",
    "smartLoading.recommendationsTitle": "Loading Recommendations",
    "smartLoading.recommendationsDescription": "Only additional suggested quantities are shown.",
    "smartLoading.suggestedLoading": "Suggested Loading",
    "smartLoading.showReason": "Show quantity reason",
    "smartLoading.vehicleStock": "Vehicle Stock",
    "smartLoading.weeklyAverage": "Weekly Average",
    "smartLoading.confirmedOrders": "Confirmed Orders",
    "smartLoading.confirmedOrdersHint": "This quantity is set by the representative or supervisor based on confirmed customer orders.",
    "smartLoading.safetyStock": "Safety Stock",
    "smartLoading.safetyStockHint": "Safety stock is set by the representative or supervisor according to product movement and route conditions.",
    "smartLoading.empty": "There are no additional loading recommendations at this time.",
    "smartLoading.error": "Unable to calculate loading recommendations.",
    "smartLoading.retry": "Try again",
    "smartLoading.vehicleStockUnavailable": "Vehicle stock is currently unavailable.",
    "smartLoading.vehicleStockUnavailableHint": "Loading recommendations need the vehicle balance for the automatically scoped route.",
    "smartLoading.checklistTitle": "Pre-Departure Checklist",
    "smartLoading.checklistDescription": "An execution review that does not change the loading decision.",
    "smartLoading.checklist.quantities": "Review loading quantities",
    "smartLoading.checklist.priority": "Load priority products",
    "smartLoading.checklist.cartons": "Check cartons",
    "smartLoading.checklist.verified": "Verify quantities",
    "smartLoading.checklist.organized": "Organize products in the vehicle",
    "smartLoading.checklist.approved": "Approve loading",
    "smartLoading.startRoute": "Start Route",
    "smartLoading.refresh": "Refresh",
    "smartLoading.noOtherAlerts": "There are no additional alerts.",
    "smartLoading.staleProducts": "Stale Products",
    "smartLoading.staleProductsPage": "Stale Products",
    "smartLoading.staleProductsPlanTitle": "Stale Products Clearance Plan",
    "smartLoading.staleProductsLoading": "Loading stale products...",
    "smartLoading.staleProductsError": "Unable to load stale product data.",
    "smartLoading.noStaleProducts": "There are no stale products for the selected stale period.",
    "smartLoading.selectStaleProduct": "Select a product to view customers who actually purchased it.",
    "smartLoading.noPurchasingCustomers": "There are no recorded purchases for this product in your scope.",
    "smartLoading.customer": "Customer",
    "smartLoading.totalPurchasedQuantity": "Total purchased quantity",
    "smartLoading.purchaseFrequency": "Purchase frequency",
    "smartLoading.lastPurchaseDate": "Last purchase date",
    "smartLoading.daysStale": "Stale days",
    "smartLoading.productLabel": "Product",
    "smartLoading.openAllSections": "Open all sections",
    "smartLoading.closeAllSections": "Close all sections",
    "smartLoading.practicalDecision": "Practical decision",
    "smartLoading.customerEvidence": "Customer evidence: {count} buyers",
    "smartLoading.staleProductsPanelTitle": "Stale Products",
    "smartLoading.priorityProductsPanelTitle": "Priority Products",
    "smartLoading.close": "Close",
    "smartLoading.uncategorized": "Uncategorized",
    "smartLoading.restore": "Restore",
    "smartLoading.manualOverrideNote": "Quantity manually adjusted (original: {value})",
    "smartLoading.quantityUnit": "product",
    "smartLoading.lastSale": "Last sale",
    "smartLoading.staleDaysUnit": "days",
    "smartLoading.noStaleSalesOverThreshold": "No products have a last sale older than 4 days.",
    "smartLoading.missingLastSaleData": "{count} products have no last sale data.",
    "smartLoading.salesDataDetails": "Last sale data details",
    "smartLoading.productsWithRecentSales": "Products with recent sales",
    "smartLoading.productsWithStaleSales": "Products with stale sales",
    "smartLoading.productsWithoutLastSaleDate": "Products without a last sale date",
    "smartLoading.exportExcel": "Excel",
    "smartLoading.exportOds": "ODS",
    "smartLoading.exportColumnProduct": "Product",
    "smartLoading.exportColumnCategory": "Category",
    "smartLoading.export": "Export",
    "smartLoading.refreshing": "Refreshing",
    "smartLoading.refreshFailed": "Unable to refresh loading data. Try again.",
    "smartLoading.exportColumnSource": "Addition Type",
    "smartLoading.addedManually": "Added manually",
    "smartLoading.recommended": "Recommended",
    "smartLoading.addProduct": "Add product",
    "smartLoading.addProductDescription": "Search the session products and set a positive loading quantity.",
    "smartLoading.searchProducts": "Search products",
    "smartLoading.noProductsFound": "No products found",
    "smartLoading.manualQuantity": "Loading quantity",
    "smartLoading.removeProduct": "Remove product",
    "smartLoading.restoreOriginalList": "Restore original list",
    "smartLoading.alertsTitle": "Today's Alerts",
    "smartLoading.lostOpportunities": "Lost Opportunities",
    "smartLoading.lostOpportunitiesDescription": "Tomorrow route customer opportunities grouped by category and product.",
    "smartLoading.lostOpportunityCategories": "Categories",
    "smartLoading.lostOpportunityProducts": "Products",
    "smartLoading.lostOpportunityCustomers": "Customer opportunities",
    "smartLoading.searchLostOpportunities": "Search category, product, code, or customer",
    "smartLoading.lostOpportunitiesError": "Unable to load lost opportunities. Try refreshing the screen.",
    "smartLoading.noLostOpportunities": "No matching lost opportunities.",
    "smartLoading.categoryTotal": "Total quantity: {value}",
    "smartLoading.categoryPartiallyAdded": "Added {added} of {total} products",
    "smartLoading.productSuggestedQuantity": "Suggested quantity: {value}",
    "smartLoading.customerSuggestedQuantity": "Suggested quantity for {customer}",
    "smartLoading.addCategory": "Add category",
    "smartLoading.addToLoading": "Add to loading",
    "smartLoading.added": "Added",
    "smartLoading.vehicleStockQuantity": "Current vehicle stock: {value}",
    "smartLoading.reviewCapacity": "Review capacity before approving loading.",
    "smartLoading.pdfExportedAt": "Exported at",
    "smartLoading.toDate": "To date",
    "smartLoading.noRecommendations": "No recommendations for this period.",
    "smartLoading.awaitingCalculation": "Choose customers to calculate recommendations.",
    "smartLoading.selectProduct": "Select a product",
    "smartLoading.onceWeekly": "Once weekly",
    "smartLoading.invalidDateRange": "The start date must be on or before the end date.",
    "smartLoading.noCustomersFound": "No customers found",
    "smartLoading.calendarDays": "Calendar days",
    "smartLoading.visitsPerWeek": "Route visits pattern",
    "smartLoading.add": "Add",
    "smartLoading.estimatedSuggestedQuantity": "Estimated suggested quantity",
    "smartLoading.editRoute": "Edit route",
    "smartLoading.exceptionalCustomer": "Exceptionally added",
    "smartLoading.sessionSummary": "Session summary",
    "smartLoading.applyAndClose": "Apply and close",
    "smartLoading.exceptionalCustomers": "Exceptionally added",
    "smartLoading.noConfirmedOrders": "No confirmed orders added.",
    "smartLoading.visitCustomers": "Visit customers",
    "smartLoading.selectedCustomers": "Selected",
    "smartLoading.estimatedDemand": "Estimated customer demand",
    "smartLoading.aggregatedConfirmedOrders": "Aggregated confirmed orders",
    "smartLoading.visitsHint": "This value is used to calculate an estimated quantity for each visit.",
    "smartLoading.routeSetup": "Route setup",
    "smartLoading.twiceWeekly": "Twice weekly",
    "smartLoading.orderTotals": "Products",
    "smartLoading.searchCustomers": "Search customers",
    "smartLoading.sixWeekly": "6 times weekly",
    "smartLoading.fromDate": "From date",
    "smartLoading.noSelectedCustomers": "Select at least one customer before calculation.",
    "smartLoading.currentRecommendations": "Current loading recommendations",
    "smartLoading.remove": "Remove",
    "fsos360.company": "Company",
    "fsos360.region": "Region",
    "fsos360.city": "City",
    "fsos360.branch": "Branch",
    "fsos360.manager": "Manager",
    "fsos360.supervisor": "Supervisor",
    "fsos360.route": "Route",
    "fsos360.salesRep": "Sales Representative",
    "fsos360.customer": "Customer",
    "fsos360.brand": "Brand",
    "fsos360.category": "Category",
    "fsos360.product": "Product",
    "fsos360.title": "FSOS 360",
    "fsos360.subtitle": "A unified executive workspace to understand performance and decide what's next.",
    "fsos360.refresh": "Refresh",
    "fsos360.filters": "Filters",
    "fsos360.filtersDescription": "Choose the period and scope to analyze.",
    "fsos360.currentPeriod": "Current Period",
    "fsos360.comparisonPeriod": "Comparison Period",
    "fsos360.analysisFocus": "Analysis Level",
    "fsos360.auto": "Auto",
    "fsos360.removedSelections": "{count} selection(s) were removed after they became invalid for the new filters.",
    "fsos360.loading": "Loading...",
    "fsos360.error": "Unable to load the workspace data.",
    "fsos360.executiveInsight": "Executive Insight",
    "fsos360.noInsight": "No executive insight is available right now.",
    "fsos360.kpiSummary": "KPI Summary",
    "fsos360.comparedToPrevious": "Compared to the previous period",
    "fsos360.performanceComparison": "Performance Comparison",
    "fsos360.indicator": "Indicator",
    "fsos360.current": "Current",
    "fsos360.previous": "Previous",
    "fsos360.change": "Change",
    "fsos360.changePercent": "Change %",
    "fsos360.timeline": "Timeline",
    "fsos360.target": "Target",
    "fsos360.targetValue": "Target Value",
    "fsos360.achievement": "Achievement",
    "fsos360.achievementPercent": "Achievement %",
    "fsos360.remaining": "Remaining",
    "fsos360.visualization": "Visualization",
    "fsos360.visualizationDescription": "The visualization type changes automatically based on the analysis context.",
    "fsos360.totalRows": "Total records: {count}",
    "fsos360.mappedRows": "Shown on map: {count}",
    "fsos360.unmappedRows": "Without coordinates: {count}",
    "fsos360.routePointsOnly": "Visit points only — route geometry is not available.",
    "fsos360.empty": "There isn't enough data to show this analysis.",
    "fsos360.notAvailable": "Not available right now.",
    "fsos360.opportunities": "Opportunities",
    "fsos360.recommendations": "Recommendations",
    "fsos360.search": "Search",
    "fsos360.unavailable": "Unavailable",
    "fsos360.noResults": "No results",
    "fsos360.clear": "Clear",
    "fsos360.next": "Next",
    "fsos360.available": "Available",
    "fsos360.partial": "Partially available",
    "fsos360.not-applicable": "Not applicable",
    "fsos360.pending-business-approval": "Pending business rule approval",
    "fsos360.focus.company": "Company",
    "fsos360.focus.region": "Region",
    "fsos360.focus.branch": "Branch",
    "fsos360.focus.manager": "Manager",
    "fsos360.focus.supervisor": "Supervisor",
    "fsos360.focus.route": "Route",
    "fsos360.focus.sales-rep": "Sales Representative",
    "fsos360.focus.customer": "Customer",
    "fsos360.focus.brand": "Brand",
    "fsos360.focus.category": "Category",
    "fsos360.focus.product": "Product",
    "fsos360.kpi.sales": "Sales",
    "fsos360.kpi.collections": "Collections",
    "fsos360.kpi.returns": "Returns",
    "fsos360.kpi.lost-sales": "Lost Sales",
    "fsos360.kpi.orders": "Orders",
    "fsos360.kpi.coverage": "Coverage",
    "fsos360.kpi.strike-rate": "Strike Rate",
    "fsos360.kpi.productivity": "Productivity",
    "fsos360.kpi.sales.change": "Change in sales compared to the reference period.",
    "fsos360.kpi.collections.change": "Change in collections compared to the reference period.",
    "fsos360.kpi.returns.change": "Change in returns compared to the reference period.",
    "fsos360.kpi.orders.change": "Change in order count compared to the reference period.",
    "fsos360.kpi.coverage.change": "Change in coverage compared to the reference period.",
    "fsos360.kpi.strikeRate.change": "Change in visit strike rate compared to the reference period.",
    "fsos360.kpi.productivity.change": "Change in productivity compared to the reference period.",
    "fsos360.reason.customers-dataset-unavailable": "Customer data is not available.",
    "fsos360.reason.products-dataset-unavailable": "Product data is not available.",
    "fsos360.reason.pending-business-approval": "Pending business rule approval before this can be shown.",
    "fsos360.reason.sgi-filter-scope-not-supported": "The Sales Growth engine does not yet support this filter scope.",
    "fsos360.reason.lost-sales-aggregation-and-deduplication-unapproved": "The Lost Sales aggregation logic has not been approved yet.",
    "fsos360.reason.route-assignment-history-unavailable": "Historical route assignment records are not available for this analysis.",
    "fsos360.reason.route-month-target-source": "The target is built from route/month target data.",
    "fsos360.reason.targets-dataset-unavailable": "Target data is not available.",
    "fsos360.reason.ambiguous-analysis-focus": "The analysis level is ambiguous because multiple filters are active at once.",
    "fsos360.reason.manager-supervisor-role-ambiguous": "Manager and supervisor cannot be reliably distinguished right now.",
    "fsos360.reason.invoices-dataset-unavailable": "Invoice data is not available.",
    "fsos360.reason.filter-not-supported": "This filter is not supported for this metric.",
    "fsos360.reason.zero-denominator": "This cannot be calculated because there are no productive visits.",
    "fsos360.reason.analysis-level-does-not-own-target": "This analysis level does not own a direct target.",
    "fsos360.reason.partial-period": "The selected period does not cover a complete month.",
    "fsos360.reason.incomplete-target-coverage": "Target data coverage is incomplete for this scope.",
    "fsos360.reason.analysis-unavailable": "This analysis is not available right now.",
    "fsos360.reason.product-filter-not-supported-for-collections": "Product filters are not supported for the collections metric.",
    "fsos360.reason.product-filter-not-supported-for-returns": "Product filters are not supported for the returns metric.",
    "fsos360.reason.product-filter-not-supported-for-visits": "Product filters are not supported for visit-based metrics.",
    "fsos360.reason.products-or-invoices-dataset-unavailable": "Product or invoice data is not available.",
    "fsos360.reason.missing-dataset": "The required data is not available.",
    "fsos360.visualization.timeline": "Timeline",
    "fsos360.visualization.line": "Line Chart",
    "fsos360.visualization.bar": "Vertical Bar Chart",
    "fsos360.visualization.treemap": "Treemap",
    "fsos360.visualization.heat-map": "Heat Map",
    "fsos360.visualization.coverage-map": "Coverage Map",
    "fsos360.visualization.route-map": "Route Map",
    "fsos360.visualization.customer-density": "Customer Density",
    "performance.targetSales": "Sales target", "performance.targetCollections": "Collections target", "performance.targetWeight": "Weight target", "performance.targetActiveCustomers": "Active customers target", "performance.targetProductiveCalls": "Productive visits target", "performance.targetSkuDistribution": "SKU distribution target",
    "performance.title": "Performance & Growth", "performance.subtitle": "Track actual performance against benchmarks and targets", "performance.loadError": "Could not load performance data. Please refresh.", "performance.sellingDays": "Selling days", "performance.previousMonth": "Previous month", "performance.previousQuarter": "Previous quarter average", "performance.growthTitle": "Growth rates (MTD)", "performance.comparisonDays": "Compared using the first {count} actual selling days", "performance.againstPreviousMonth": "Against previous month", "performance.againstPreviousQuarter": "Against previous quarter average", "performance.sales": "Sales value", "performance.collections": "Collections", "performance.invoices": "Invoices", "performance.customers": "Buying customers", "performance.skus": "Sold SKUs", "performance.returns": "Returns value", "performance.noChange": "No change", "performance.referencePeriod": "Reference period", "performance.quarterAverage": "Average of last 3 months", "performance.primaryTargets": "Performance against target (to date)", "performance.secondaryTargets": "Additional targets", "performance.monthlyTarget": "Monthly target", "performance.actual": "Actual", "performance.targetToDate": "Target to date", "performance.difference": "Difference", "performance.achievement": "Pacing achievement", "performance.remaining": "Remaining target", "performance.requiredDaily": "Required daily", "performance.forecast": "End-of-month forecast", "performance.ahead": "Achieved / ahead", "performance.nearPlan": "Near plan", "performance.behind": "Behind plan", "performance.unavailable": "Unavailable", "subscription.title": "Subscription", "subscription.plan": "Plan", "subscription.paymentStatus": "Payment status", "subscription.paid": "Paid", "subscription.unpaid": "Unpaid", "subscription.trialEnds": "Trial ends", "subscription.blocked": "Your subscription is {status}. Uploading files and using Murshidak are unavailable until this is resolved.",
    "shared.error.requestFailed": "Request failed. Please try again.",
    "shared.error.unauthorized": "Your session has expired. Please sign in again.",
    "shared.error.forbidden": "You do not have permission to perform this action.",
    "shared.error.notFound": "The requested item was not found.",
    "shared.error.conflict": "The action could not be completed because of a data conflict.",
    "shared.validation.invalid": "Review the required fields and try again.",
    "shared.toast.copied": "Copied",
    "shared.tempPassword.title": "Temporary password for {email}",
    "shared.tempPassword.description": "Copy it now. It is shown once only; the user must change it at first sign-in.",
    "shared.action.copy": "Copy",
    "shared.action.dismiss": "Dismiss",
    "admin.nav.userActivity": "User activity",
  },
};
