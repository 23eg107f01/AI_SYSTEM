#!/usr/bin/env python
"""Direct test of classifier to debug LLM issues."""
import asyncio
import logging
import sys

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s'
)

sys.path.insert(0, '/root/backend')

async def test_classifier():
    """Test classifier directly."""
    from services.classifier import classify_ticket
    
    test_message = "I was charged twice for my subscription"
    print(f"\n=== Testing classifier with: {test_message} ===\n")
    
    result = await classify_ticket(test_message)
    
    print(f"\n=== Result ===")
    print(f"Category: {result.get('category')}")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Model: {result.get('model')}")
    print(f"Input tokens: {result.get('input_tokens')}")
    print(f"Output tokens: {result.get('output_tokens')}")
    print(f"Timed out: {result.get('timed_out')}")

if __name__ == '__main__':
    asyncio.run(test_classifier())
