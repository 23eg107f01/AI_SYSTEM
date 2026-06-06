#!/usr/bin/env python
"""Test script to generate LangSmith traces."""
import httpx
import json
import time

def test_traces():
    """Create test tickets to trigger LLM calls."""
    
    # Login
    login_res = httpx.post('http://127.0.0.1:8000/auth/login', json={
        'email': 'test@example.com',
        'password': 'testpass123'
    }, timeout=10)

    if login_res.status_code == 200:
        tokens = login_res.json()
        access_token = tokens['access_token']
        print('✓ Login successful')
        
        # First ticket
        print('\nCreating ticket 1...')
        ticket_res = httpx.post(
            'http://127.0.0.1:8000/api/tickets',
            json={
                'message': 'How do I reset my password? I cannot access my account.',
                'contact_name': 'Jane Smith',
                'contact_email': 'jane@example.com'
            },
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=30
        )
        
        print(f'Status: {ticket_res.status_code}')
        resp = ticket_res.json()
        print(f'Category: {resp.get("category")}')
        print(f'Sentiment: {resp.get("sentiment")}')
        print(f'Quality Score: {resp.get("quality_score")}')
        print(f'Status: {resp.get("status")}')
        
        print('\nWaiting 2 seconds...')
        time.sleep(2)
        
        # Second ticket
        print('\nCreating ticket 2...')
        ticket_res2 = httpx.post(
            'http://127.0.0.1:8000/api/tickets',
            json={
                'message': 'The website is down and I cannot place orders',
                'contact_name': 'Bob Johnson',
                'contact_email': 'bob@example.com'
            },
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=30
        )
        
        print(f'Status: {ticket_res2.status_code}')
        resp2 = ticket_res2.json()
        print(f'Category: {resp2.get("category")}')
        print(f'Sentiment: {resp2.get("sentiment")}')
        print(f'Quality Score: {resp2.get("quality_score")}')
        print(f'Status: {resp2.get("status")}')
        
        print('\n✓ Test complete!')
        print('Check LangSmith at: https://smith.langchain.com/projects/AI_SYSTEM')
    else:
        print(f'Login error: {login_res.status_code}')
        print(login_res.text)

if __name__ == '__main__':
    test_traces()
