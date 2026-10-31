<?php

return [
    ['key' => 'visits', 'name' => 'admin::app.property-api.visits', 'route' => 'api.v1.admin.visits.index', 'sort' => 6],
    ['key' => 'visits.view', 'name' => 'admin::app.acl.view', 'route' => ['api.v1.admin.visits.show', 'api.v1.admin.visits.agents'], 'sort' => 1],
    ['key' => 'visits.create', 'name' => 'admin::app.acl.create', 'route' => 'api.v1.admin.visits.store', 'sort' => 2],
    ['key' => 'visits.edit', 'name' => 'admin::app.acl.edit', 'route' => ['api.v1.admin.visits.schedule', 'api.v1.admin.visits.status', 'api.v1.admin.visits.feedback'], 'sort' => 3],
    ['key' => 'visits.assign', 'name' => 'admin::app.property-api.assign-visits', 'route' => 'api.v1.admin.visits.assign', 'sort' => 4],
    ['key' => 'leads.assign', 'name' => 'admin::app.property-api.assign-leads', 'route' => ['api.v1.admin.leads.assign', 'api.v1.admin.leads.assignees'], 'sort' => 5],
    ['key' => 'properties', 'name' => 'admin::app.property-api.properties', 'route' => 'api.v1.admin.properties.index', 'sort' => 3],
    ['key' => 'properties.create', 'name' => 'admin::app.property-api.create', 'route' => 'api.v1.admin.properties.store', 'sort' => 1],
    ['key' => 'properties.edit', 'name' => 'admin::app.property-api.edit', 'route' => 'api.v1.admin.properties.update', 'sort' => 2],
    ['key' => 'properties.delete', 'name' => 'admin::app.property-api.delete', 'route' => 'api.v1.admin.properties.destroy', 'sort' => 3],
    ['key' => 'properties.enquiries', 'name' => 'admin::app.property-api.enquiries', 'route' => 'api.v1.admin.enquiries.index', 'sort' => 4],
];
