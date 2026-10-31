#!/usr/bin/env python3
"""Generate reproducible Postman v2.1 artifacts from the checked-in OpenAPI contract."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'docs/postman'
SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'


def event(kind, code):
    return {'listen': kind, 'script': {'type': 'text/javascript', 'exec': code.strip().splitlines()}}


def request(name, method, path, expected=200, body=None, public=False, tests='', pre='', form=None):
    req = {'method': method, 'header': [{'key': 'Accept', 'value': 'application/json'}, {'key': 'Origin', 'value': '{{frontend_origin}}'}], 'url': '{{base_url}}' + path}
    if public:
        req['auth'] = {'type': 'noauth'}
    if body is not None:
        req['header'].append({'key': 'Content-Type', 'value': 'application/json'})
        req['body'] = {'mode': 'raw', 'raw': json.dumps(body, indent=2), 'options': {'raw': {'language': 'json'}}}
    if form is not None:
        req['body'] = {'mode': 'formdata', 'formdata': form}
    out = {'name': name, 'request': req, 'event': [event('test', f'pm.test("HTTP {expected}", () => pm.response.to.have.status({expected}));\n' + tests)]}
    if pre:
        out['event'].insert(0, event('prerequest', pre))
    return out


def collection(name, description, items, ident):
    return {'info': {'_postman_id': ident, 'name': name, 'description': description, 'schema': SCHEMA}, 'auth': {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{access_token}}', 'type': 'string'}]}, 'item': items}


PROPERTY = {'title': '{{property_title}}', 'purpose': 'sale', 'property_type': 'house', 'price': '6500000.50', 'area': '1200', 'area_unit': 'sqft', 'address': 'Integration fixture address', 'city': 'Dandeli', 'state': 'Karnataka', 'owner_name': 'Integration fixture owner', 'status': 'available', 'is_published': True, 'accepts_enquiries': True}
ENQUIRY = {'submission_id': '{{submission_id}}', 'name': 'Integration Customer', 'email': 'integration-{{run_id}}@example.com', 'phone': '+91 9000000000', 'message': 'Integration fixture: arrange a visit.', 'consent': True}
VISIT = {'property_id': '{{property_id}}', 'lead_id': '{{lead_id}}', 'user_id': '{{user_id}}', 'starts_at': '{{visit_start}}', 'ends_at': '{{visit_end}}', 'notes': 'Integration fixture visit'}
DEAL = {'request_id': '{{request_id}}', 'property_id': '{{property_id}}', 'lead_id': '{{lead_id}}', 'agreed_price': '6500000.50', 'booking_amount': '50000.25', 'payment_reference': 'Integration fixture, no payment collected'}
LOGIN = {'email': '{{staff_email}}', 'password': '{{staff_password}}', 'device_name': 'Postman integration kit'}
DOCUMENT = [{'key': 'title', 'value': 'Integration test registry', 'type': 'text'}, {'key': 'category', 'value': 'registry', 'type': 'text'}, {'key': 'file', 'type': 'file', 'src': '{{document_file}}'}]


def capture(key, expr='pm.response.json().data.id'):
    return f'if (pm.response.code < 300) pm.environment.set("{key}", String({expr}));'


def workflow():
    setup = '''
if (!pm.environment.get('staff_email') || !pm.environment.get('staff_password')) throw new Error('Set staff_email and staff_password in the selected local/staging environment.');
['access_token','property_id','lead_id','user_id','enquiry_id','visit_id','task_id','note_id','document_id','deal_id','cancelled_deal_id'].forEach(k => pm.environment.unset(k));
const guid = () => pm.variables.replaceIn('{{$guid}}');
pm.environment.set('run_id', guid());
pm.environment.set('property_title', 'Integration fixture ' + pm.environment.get('run_id'));
pm.environment.set('submission_id', guid());
pm.environment.set('request_id', guid());
pm.environment.set('second_request_id', guid());
const iso = offset => new Date(Math.floor((Date.now() + offset) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
pm.environment.set('visit_start', iso(172800000));
pm.environment.set('visit_end', iso(176400000));
pm.environment.set('visit_start_later', iso(180000000));
pm.environment.set('visit_end_later', iso(183600000));
pm.environment.set('task_due', iso(86400000));
'''
    items = [request('01 Login and initialize isolated demo IDs', 'POST', '/auth/login', 201, LOGIN, True, capture('access_token', 'pm.response.json().data.access_token'), setup)]
    preflight = request('02 Browser preflight', 'OPTIONS', '/admin/properties', 204, public=True, tests='pm.test("Configured browser origin", () => pm.expect(pm.response.headers.get("Access-Control-Allow-Origin")).to.eql(pm.environment.get("frontend_origin")));')
    preflight['request']['header'] += [{'key': 'Access-Control-Request-Method', 'value': 'POST'}, {'key': 'Access-Control-Request-Headers', 'value': 'authorization,content-type'}]
    items += [preflight,
        request('03 Current staff profile', 'GET', '/auth/me', tests=capture('user_id')),
        request('04 Create published fixture property', 'POST', '/admin/properties', 201, PROPERTY, tests=capture('property_id')),
        request('05 Public property privacy', 'GET', '/properties/{{property_id}}', public=True, tests='pm.test("No owner contact", () => pm.expect(pm.response.json().data).not.to.have.property("owner_phone"));'),
        request('06 Public catalogue', 'GET', '/properties?per_page=5', public=True),
        request('07 Public enquiry', 'POST', '/properties/{{property_id}}/enquiries', 202, ENQUIRY, True),
        request('08 Retry same enquiry', 'POST', '/properties/{{property_id}}/enquiries', 202, ENQUIRY, True),
        request('09 Resolve enquiry to lead', 'GET', '/admin/enquiries?property_id={{property_id}}', tests='''
pm.test('Exactly one enquiry after retry', () => pm.expect(pm.response.json().data).to.have.length(1));
if (pm.response.code === 200 && pm.response.json().data.length === 1) {
 pm.environment.set('lead_id', String(pm.response.json().data[0].lead_id));
 pm.environment.set('enquiry_id', String(pm.response.json().data[0].id));
}
'''),
        request('10 Lead detail', 'GET', '/admin/leads/{{lead_id}}'),
        request('11 Add lead note', 'POST', '/admin/leads/{{lead_id}}/follow-ups', 201, {'type': 'note', 'comment': 'Integration fixture: customer prefers a visit'}, tests=capture('note_id')),
        request('12 Add dated follow-up', 'POST', '/admin/leads/{{lead_id}}/follow-ups', 201, {'type': 'task', 'title': 'Integration fixture call', 'due_at': '{{task_due}}'}, tests=capture('task_id')),
        request('13 Complete follow-up', 'PATCH', '/admin/leads/{{lead_id}}/follow-ups/{{task_id}}', body={'is_done': True}),
        request('14 Follow-up history', 'GET', '/admin/leads/{{lead_id}}/follow-ups'),
        request('15 Schedule site visit', 'POST', '/admin/site-visits', 201, VISIT, tests=capture('visit_id')),
        request('16 Reschedule site visit', 'PATCH', '/admin/site-visits/{{visit_id}}/schedule', body={'starts_at': '{{visit_start_later}}', 'ends_at': '{{visit_end_later}}', 'reason': 'Integration fixture reschedule'}),
        request('17 Cancel site visit', 'PATCH', '/admin/site-visits/{{visit_id}}/status', body={'status': 'cancelled', 'cancellation_reason': 'Integration fixture: proceeding remotely'}),
        request('18 Upload optional private document', 'POST', '/admin/properties/{{property_id}}/documents', 201, tests=capture('document_id'), pre="if (!pm.environment.get('document_file')) pm.execution.skipRequest();", form=DOCUMENT),
        request('19 List private document metadata', 'GET', '/admin/properties/{{property_id}}/documents'),
        request('20 Download optional attachment', 'GET', '/admin/properties/{{property_id}}/documents/{{document_id}}/download', tests='pm.test("Private attachment", () => pm.expect(pm.response.headers.get("Content-Disposition")).to.include("attachment"));', pre="if (!pm.environment.get('document_id')) pm.execution.skipRequest();"),
        request('21 Overview before reservation', 'GET', '/admin/reports/overview'),
        request('22 Reserve property', 'POST', '/admin/property-deals', 201, DEAL, tests=capture('deal_id') + '\n' + capture('cancelled_deal_id') + '\npm.test("Exact amount", () => pm.expect(pm.response.json().data.booking_amount).to.eql("50000.25"));'),
        request('23 Replay booking request', 'POST', '/admin/property-deals', 200, DEAL, tests='pm.test("Same deal", () => pm.expect(String(pm.response.json().data.id)).to.eql(pm.environment.get("deal_id")));'),
        request('24 Reserved property hidden publicly', 'GET', '/properties/{{property_id}}', 404, public=True),
        request('25 Reserved inventory report', 'GET', '/admin/reports/overview', tests='pm.test("Reserved inventory present", () => pm.expect(pm.response.json().data.properties.reserved).to.be.at.least(1));'),
        request('26 Cancel reservation', 'PATCH', '/admin/property-deals/{{deal_id}}/cancel', body={'cancellation_reason': 'Integration fixture revised terms'}),
        request('27 Released property is public', 'GET', '/properties/{{property_id}}', public=True),
        request('28 Reserve revised deal with a new key', 'POST', '/admin/property-deals', 201, dict(DEAL, request_id='{{second_request_id}}'), tests=capture('deal_id')),
        request('29 Confirm sale', 'PATCH', '/admin/property-deals/{{deal_id}}/confirm', body={}, tests='pm.test("Confirmed", () => pm.expect(pm.response.json().data.status).to.eql("confirmed"));'),
        request('30 Retry confirmation', 'PATCH', '/admin/property-deals/{{deal_id}}/confirm', body={}, tests='pm.test("No duplicate audit event", () => pm.expect(pm.response.json().data.events).to.have.length(2));'),
        request('31 Sold inventory', 'GET', '/admin/properties/{{property_id}}', tests='pm.test("Sold", () => pm.expect(pm.response.json().data.status).to.eql("sold"));'),
        request('32 Private deal history', 'GET', '/admin/property-deals/{{deal_id}}'),
        request('33 Agent performance', 'GET', '/admin/reports/agents?user_id={{user_id}}'),
        request('34 Delete optional document', 'DELETE', '/admin/properties/{{property_id}}/documents/{{document_id}}', 204, pre="if (!pm.environment.get('document_id')) pm.execution.skipRequest();"),
        request('35 Delete only the captured fixture property', 'DELETE', '/admin/properties/{{property_id}}', 204),
        request('36 Retained confirmed deal history', 'GET', '/admin/property-deals/{{deal_id}}', tests='pm.test("Property reference cleared, history preserved", () => pm.expect(pm.response.json().data.property_id).to.eql(null));'),
        request('37 Logout and clear token', 'POST', '/auth/logout', 204, body={}, tests="if (pm.response.code === 204) { pm.variables.set('revoked_token', pm.environment.get('access_token')); pm.environment.unset('access_token'); }"),
        request('38 Verify revoked token', 'GET', '/auth/me', 401, tests="pm.test('Revoked token was supplied', () => pm.expect(pm.variables.get('revoked_token')).to.be.a('string').and.not.empty); pm.variables.unset('revoked_token');")]
    items[-1]['request']['auth'] = {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{revoked_token}}', 'type': 'string'}]}
    return collection('SDA — Complete integration workflow', 'Run on a disposable local/test or staging dataset with an explicitly authorized staff account. Creates fictional records and deletes only the captured fixture property/document; CRM contact/lead/enquiry/visit/deal audit history remains by API design. Choose the supplied environment, fill staff credentials and set document_file to the sample PDF for full coverage. No frontend or payment gateway is involved. See ../INTEGRATION.md.', [{'name': 'Complete workflow', 'item': items}], 'c4b17b47-cdbf-4dc8-82e4-f9dc4830718b')


def reference(spec):
    bodies = {
        ('post', '/auth/login'): LOGIN,
        ('post', '/admin/properties'): PROPERTY, ('put', '/admin/properties/{id}'): PROPERTY,
        ('post', '/properties/{id}/enquiries'): ENQUIRY,
        ('patch', '/admin/leads/{id}/assignment'): {'user_id': '{{user_id}}'},
        ('patch', '/admin/leads/{id}/stage'): {'lead_pipeline_stage_id': '{{stage_id}}'},
        ('post', '/admin/leads/{id}/follow-ups'): {'type': 'task', 'title': 'Call buyer', 'due_at': '{{task_due}}'},
        ('patch', '/admin/leads/{id}/follow-ups/{activityId}'): {'is_done': True},
        ('post', '/admin/site-visits'): VISIT,
        ('patch', '/admin/site-visits/{id}/schedule'): {'starts_at': '{{visit_start_later}}', 'ends_at': '{{visit_end_later}}', 'reason': 'Customer requested later slot'},
        ('patch', '/admin/site-visits/{id}/assignment'): {'user_id': '{{user_id}}'},
        ('patch', '/admin/site-visits/{id}/status'): {'status': 'cancelled', 'cancellation_reason': 'Customer unavailable'},
        ('patch', '/admin/site-visits/{id}/feedback'): {'feedback': 'Customer liked the location'},
        ('post', '/admin/property-deals'): DEAL,
        ('patch', '/admin/property-deals/{id}/confirm'): {},
        ('patch', '/admin/property-deals/{id}/cancel'): {'cancellation_reason': 'Customer withdrew'},
        ('post', '/auth/logout'): {},
    }
    folders = {}
    for path, methods in spec['paths'].items():
        for method, operation in methods.items():
            if method not in ('get', 'post', 'put', 'patch', 'delete'):
                continue
            doc = '/documents' in path
            ident = 'document_id' if doc else 'visit_id' if 'site-visits/' in path else 'deal_id' if 'property-deals/' in path else 'lead_id' if '/leads/' in path else 'property_id'
            url = path.replace('{id}', '{{'+ident+'}}').replace('{propertyId}', '{{property_id}}').replace('{activityId}', '{{task_id}}')
            public = path.startswith('/auth/login') or path.startswith('/properties')
            expected = min(int(c) for c in operation.get('responses', {}) if c.isdigit() and 200 <= int(c) < 300)
            if method == 'post' and path == '/admin/property-deals':expected = 201
            item = request(method.upper()+' '+path, method.upper(), url, expected, bodies.get((method, path)), public, form=DOCUMENT if doc and method == 'post' else None)
            if operation.get('requestBody', {}).get('required') and item['request'].get('body') is None:
                raise ValueError('Missing required request example: '+method.upper()+' '+path)
            item['request']['description'] = operation.get('summary', '')+'\n\n'+operation.get('description', '')+'\n\nManual reference: fill IDs and timestamps in the environment first. Do not run this entire reference collection as a workflow. See OpenAPI/API.md for filters and alternatives.'
            if method == 'post' and path == '/auth/login':item['event'].append(event('test', capture('access_token', 'pm.response.json().data.access_token')))
            group = 'Auth' if path.startswith('/auth') else 'Documents' if doc else 'Deals' if 'property-deals' in path else 'Visits' if 'site-visit' in path else 'Reports' if '/reports/' in path else 'Leads and follow-ups' if any(x in path for x in ['lead', 'follow-up']) else 'Properties and enquiries'
            folders.setdefault(group, []).append(item)
    return collection('SDA — API reference', 'Every documented API operation, grouped by module. Select individual requests and supply valid current IDs/body fields; use the separate Complete integration workflow for ordered execution. Mutation/deletion requests operate on the records you supply. Credentials and token are environment variables, blank in checked-in examples.', [{'name': k, 'item': v} for k, v in folders.items()], '6e65aa01-c2b7-49fa-b544-c245712b48a3')


def environment(staging):
    base = 'https://api-staging.example.com/api/v1' if staging else 'http://127.0.0.1:8081/api/v1'
    origin = 'https://web-staging.example.com' if staging else 'http://localhost:5173'
    values = {'base_url': base, 'frontend_origin': origin, 'staff_email': '', 'staff_password': '', 'access_token': '', 'document_file': ''}
    values.update(dict.fromkeys(['run_id', 'property_title', 'submission_id', 'request_id', 'second_request_id', 'property_id', 'lead_id', 'user_id', 'enquiry_id', 'task_id', 'note_id', 'visit_id', 'document_id', 'deal_id', 'cancelled_deal_id', 'stage_id', 'visit_start', 'visit_end', 'visit_start_later', 'visit_end_later', 'task_due'], ''))
    return {'name': 'SDA staging template' if staging else 'SDA local', 'values': [{'key': k, 'value': v, 'enabled': True, 'type': 'secret' if k in ('staff_password', 'access_token') else 'default'} for k, v in values.items()], '_postman_variable_scope': 'environment'}


def sample_pdf():
    stream = b'BT /F1 12 Tf 40 100 Td (SDA integration test document) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>', b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    data = b'%PDF-1.4\n'; offsets = []
    for i, content in enumerate(objects, 1):
        offsets.append(len(data));data += str(i).encode()+b' 0 obj\n'+content+b'\nendobj\n'
    start = len(data);data += b'xref\n0 6\n0000000000 65535 f \n'
    data += b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets)
    return data+b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'


def artifacts():
    spec = json.loads((ROOT/'docs/openapi.json').read_text())
    data = {'SDA-workflow.postman_collection.json': workflow(), 'SDA-reference.postman_collection.json': reference(spec), 'SDA-local.postman_environment.json': environment(False), 'SDA-staging.postman_environment.json': environment(True)}
    result = {name: (json.dumps(value, indent=2, ensure_ascii=False)+'\n').encode() for name, value in data.items()}
    result['fixtures/registry.pdf'] = sample_pdf()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__);parser.add_argument('--check', action='store_true');args = parser.parse_args()
    for name, data in artifacts().items():
        path = DEST/name
        if args.check:
            if not path.exists() or path.read_bytes() != data:raise SystemExit('Out-of-date Postman artifact: '+name)
        else:
            path.parent.mkdir(parents=True, exist_ok=True);path.write_bytes(data)
    print('Postman artifacts '+('verified.' if args.check else 'generated.'))


if __name__ == '__main__':main()
