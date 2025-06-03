# Truck Route Card Generator (CLI)

import sys

def main():
    print("=== Truck Route Card Generator ===")
    driver = input("Driver Name: ")
    truck = input("Truck Number: ")
    route = input("Route Description: ")
    stops = input("Stops (comma separated): ")
    date = input("Date: ")
    print("\n--- Route Card ---")
    print(f"Driver: {driver}")
    print(f"Truck: {truck}")
    print(f"Route: {route}")
    print(f"Stops: {stops}")
    print(f"Date: {date}")
    print("------------------")

if __name__ == "__main__":
    main()
