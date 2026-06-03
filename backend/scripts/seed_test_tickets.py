import json
import os
import argparse
from sqlalchemy.orm import Session
import sys

# Adjust path to import from backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db.base import SessionLocal
from models.ticket import Ticket, AuditLog, Response, Escalation
from models.user import User

JSON_PATH = os.path.join(os.path.dirname(__file__), "sample_tickets.json")

def seed():
    print(f"Generating 115 sample tickets to {JSON_PATH}...")
    tickets = []
    
    # 25 Billing
    for i in range(25):
        tickets.append({"message": f"I need a refund for my last invoice #{1000+i}. It charged me twice.", "expected_category": "Billing", "expected_sentiment": "Frustrated"})
    
    # 25 Technical
    for i in range(25):
        tickets.append({"message": f"My app keeps crashing when I click the save button on screen {i}.", "expected_category": "Technical", "expected_sentiment": "Angry"})
    
    # 25 Returns
    for i in range(25):
        tickets.append({"message": f"I want to return my recent order #{5000+i}, it arrived damaged.", "expected_category": "Returns", "expected_sentiment": "Frustrated"})
    
    # 25 General
    for i in range(25):
        tickets.append({"message": f"What are your business hours? I have a general question {i}.", "expected_category": "General", "expected_sentiment": "Neutral"})
    
    # 15 Edge cases
    for i in range(15):
        tickets.append({"message": f"I will sue you if you don't fix this immediately! {i}", "expected_category": "Legal/Compliance", "expected_sentiment": "Angry"})
    
    with open(JSON_PATH, "w") as f:
        json.dump(tickets, f, indent=4)
    print("Seed complete.")

def clear():
    print("Clearing test tickets from database...")
    db: Session = SessionLocal()
    try:
        # Find test user
        test_user = db.query(User).filter(User.email == "test_eval@example.com").first()
        if test_user:
            # Delete related data first
            tickets = db.query(Ticket).filter(Ticket.user_id == test_user.id).all()
            ticket_ids = [t.id for t in tickets]
            
            if ticket_ids:
                db.query(AuditLog).filter(AuditLog.ticket_id.in_(ticket_ids)).delete(synchronize_session=False)
                db.query(Response).filter(Response.ticket_id.in_(ticket_ids)).delete(synchronize_session=False)
                db.query(Escalation).filter(Escalation.ticket_id.in_(ticket_ids)).delete(synchronize_session=False)
                db.query(Ticket).filter(Ticket.user_id == test_user.id).delete(synchronize_session=False)
                
            db.commit()
            print(f"Cleared {len(ticket_ids)} tickets belonging to test user.")
        else:
            print("No test user found in DB, nothing to clear.")
            
        if os.path.exists(JSON_PATH):
            os.remove(JSON_PATH)
            print(f"Removed {JSON_PATH}")
    except Exception as e:
        print(f"Error during clear: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="Generate sample_tickets.json")
    parser.add_argument("--clear", action="store_true", help="Clear test tickets from DB and remove JSON")
    args = parser.parse_args()
    
    if args.clear:
        clear()
    elif args.seed:
        seed()
    else:
        print("Please specify --seed or --clear")
