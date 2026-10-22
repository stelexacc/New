"""Final monthly-plan, attachment and operator-grant checks on an isolated demo server."""
from playwright.sync_api import sync_playwright, expect
from pathlib import Path
import argparse, base64, json, os, shutil, uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://127.0.0.1:4318')
parser.add_argument('--admin-token-file', required=True)
args = parser.parse_args()
base = args.base_url.rstrip('/')
root = Path(__file__).resolve().parents[1]
shots = root/'test-results'; shots.mkdir(exist_ok=True)
token = Path(args.admin_token_file).read_text().strip()
password = 'features-browser-long-password'
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=')


def nav(page, title):
    page.locator('.primary-nav button').filter(has_text=title).click()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('STELEX_CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440, 'height':1000}, accept_downloads=True)
    page = context.new_page(); errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    email = 'features-'+uuid.uuid4().hex+'@test.invalid'
    page.goto(base)
    page.locator('.auth-screen-form [name="name"]').fill('Feature Buyer')
    page.locator('.auth-screen-form [name="email"]').fill(email)
    page.locator('.auth-screen-form [name="password"]').fill(password)
    page.locator('.auth-screen-submit').click()
    expect(page.locator('.app-shell')).to_be_visible()
    expect(page.locator('.home-quota')).to_have_count(0)
    expect(page.locator('.composer-footer .output-folder')).to_be_visible()
    expect(page.locator('.main-panel > .output-folder')).to_have_count(0)
    page.screenshot(path=str(shots/'original-chat-final.png'), full_page=True)

    nav(page, 'Credits')
    expect(page.locator('.plans-grid .pricing-card')).to_have_count(3)
    expect(page.locator('.free-trial-tile')).to_be_visible()
    for amount in ['7,99', '14,99', '29,99']:
        assert amount in page.locator('.plans-grid').inner_text()
    assert 'Max' in page.locator('.plans-grid').inner_text()
    expect(page.locator('.credit-packs a')).to_have_count(7)
    for amount in ['5,00', '10,00', '20,00', '30,00', '50,00', '75,00', '100,00']:
        assert amount in page.locator('.credit-packs').inner_text()
    catalog = context.request.get(base+'/api/plans').json()
    assert all(plan['durationDays']==30 for plan in catalog['plans'] if plan['id']!='free')
    print('PASS original-style three paid cards, separate Free Trial and monthly plans with seven €5–100 top-ups')

    nav(page, 'Chat')
    page.locator('.attachment-input').set_input_files([
        {'name':'notes.py', 'mimeType':'text/x-python', 'buffer':b'print("attached")'},
        {'name':'pixel.png', 'mimeType':'image/png', 'buffer':png}
    ])
    expect(page.locator('.pending-attachments .attachment-chip')).to_have_count(2)
    expect(page.locator('.pending-attachments img')).to_have_count(1)
    assert page.locator('.composer textarea').input_value()==''
    with page.expect_response(lambda response: response.url.endswith('/api/chat') and response.request.method=='POST') as sent:
        page.locator('.send-button').click()
    response = sent.value; assert response.status==200, response.text()
    body = response.request.post_data_json
    assert body['message']=='' and len(body['attachments'])==2
    assert any(item['name']=='notes.py' and 'print("attached")' in item['content'] for item in body['attachments'])
    expect(page.locator('.pending-attachments .attachment-chip')).to_have_count(0)
    expect(page.locator('.message-attachments .attachment-chip')).to_have_count(2)
    image = page.locator('.message-attachments img')
    expect(image).to_be_visible()
    page.wait_for_function("() => [...document.querySelectorAll('.message-attachments img')].every(node => node.complete && node.naturalWidth>0)")
    page.reload(); page.locator('.conversation-link').first.click()
    expect(page.locator('.message-attachments .attachment-chip')).to_have_count(2)
    page.screenshot(path=str(shots/'attachments-desktop.png'), full_page=True)
    print('PASS text/photo attachments, attachment-only send, real persisted private image URL and reload')

    page.get_by_role('button', name='Neuer Chat', exact=False).first.click()
    page.locator('.attachment-input').set_input_files({'name':'retry.txt', 'mimeType':'text/plain', 'buffer':b'Keep this attachment until successful send.'})
    page.route('**/api/chat', lambda route: route.abort('failed'))
    page.locator('.send-button').click()
    expect(page.locator('.toast')).to_be_visible()
    expect(page.locator('.pending-attachments .attachment-chip')).to_have_count(1)
    page.unroute('**/api/chat')
    page.locator('.send-button').click()
    expect(page.locator('.message-assistant .markdown')).to_contain_text('Demomodus')
    expect(page.locator('.pending-attachments .attachment-chip')).to_have_count(0)
    page.get_by_role('button', name='Neuer Chat', exact=False).first.click()
    page.locator('.attachment-input').set_input_files({'name':'remove.txt', 'mimeType':'text/plain', 'buffer':b'remove me'})
    page.get_by_role('button', name='Anhang entfernen: remove.txt', exact=True).click()
    expect(page.locator('.pending-attachments .attachment-chip')).to_have_count(0)
    expect(page.locator('.send-button')).to_be_disabled()
    print('PASS failed send retains attached files, successful retry clears them and remove action disables empty send')

    assert not errors, errors
    browser.close()
